#!/usr/bin/env bash
set -euo pipefail

script=$(dirname "$0")/macos-hanzod.sh
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT

assert_failure() {
  local expected=$1 output
  shift
  if output=$(bash "$script" "$@" 2>&1); then
    printf 'Expected failure from %s\n' "$*" >&2
    exit 1
  fi
  if [[ "$output" != *"$expected"* ]]; then
    printf 'Expected %s, got %s\n' "$expected" "$output" >&2
    exit 1
  fi
}

# Exercise real archive extraction and Mach-O tools without network downloads.
export HANZOD_TEST_ASSETS="$test_dir/assets"
mkdir -p "$HANZOD_TEST_ASSETS" "$test_dir/bin" "$test_dir/thin"
printf 'int main(void) { return 0; }\n' > "$test_dir/main.c"
for asset_arch in arm64 amd64; do
  mac_arch=$asset_arch
  if [[ "$asset_arch" == amd64 ]]; then mac_arch=x86_64; fi
  clang -arch "$mac_arch" "$test_dir/main.c" -o "$test_dir/thin/hanzod"
  archive="$HANZOD_TEST_ASSETS/hanzod-darwin-$asset_arch.tar.gz"
  tar -czf "$archive" -C "$test_dir/thin" hanzod
  shasum -a 256 "$archive" > "$archive.sha256"
done

cat > "$test_dir/bin/curl" <<'CURL'
#!/usr/bin/env bash
set -euo pipefail
[[ "$#" -eq 6 && "$4" == -o ]]
case "$6" in
  https://github.com/hanzoai/node/releases/download/v*/hanzod-darwin-*)
    cp "$HANZOD_TEST_ASSETS/${6##*/}" "$5"
    ;;
  *) exit 1 ;;
esac
CURL
chmod +x "$test_dir/bin/curl"
export PATH="$test_dir/bin:$PATH"

for target in aarch64-apple-darwin x86_64-apple-darwin universal-apple-darwin; do
  src="$test_dir/$target/src-tauri"
  app="$test_dir/$target/Hanzo.app"
  mkdir -p "$src" "$app/Contents/MacOS"
  printf '%s\n' '{"bundle":{"macOS":{"entitlements":"entitlements.plist"},"externalBin":["binaries/other"]}}' \
    > "$src/tauri.macos.conf.json"
  bash "$script" stage "$target" "$src"
  jq -e '.bundle.externalBin == ["binaries/other", "binaries/hanzod"] and
    .bundle.macOS.entitlements == "entitlements.plist"' "$src/tauri.macos.conf.json" > /dev/null
  case "$target" in
    aarch64-apple-darwin) [[ "$(lipo -archs "$src/binaries/hanzod-$target")" == arm64 ]] ;;
    x86_64-apple-darwin) [[ "$(lipo -archs "$src/binaries/hanzod-$target")" == x86_64 ]] ;;
    universal-apple-darwin)
      lipo "$src/binaries/hanzod-$target" -verify_arch arm64 x86_64
      [[ "$(lipo -archs "$src/binaries/hanzod-aarch64-apple-darwin")" == arm64 ]]
      [[ "$(lipo -archs "$src/binaries/hanzod-x86_64-apple-darwin")" == x86_64 ]]
      ;;
  esac
  assert_failure 'missing executable' verify "$target" "$app"
  install -m 755 "$src/binaries/hanzod-$target" "$app/Contents/MacOS/hanzod"
  bash "$script" verify "$target" "$app"
done

intel_app="$test_dir/x86_64-apple-darwin/Hanzo.app"
assert_failure 'must support arm64' verify aarch64-apple-darwin "$intel_app"
assert_failure 'must support arm64 x86_64' verify universal-apple-darwin "$intel_app"
chmod 644 "$intel_app/Contents/MacOS/hanzod"
assert_failure 'missing executable' verify x86_64-apple-darwin "$intel_app"

bad_src="$test_dir/tampered/src-tauri"
mkdir -p "$bad_src"
printf '{}\n' > "$bad_src/tauri.macos.conf.json"
arm_archive="$HANZOD_TEST_ASSETS/hanzod-darwin-arm64.tar.gz"
cp "$HANZOD_TEST_ASSETS/hanzod-darwin-amd64.tar.gz" "$arm_archive"
assert_failure 'SHA256 mismatch' stage aarch64-apple-darwin "$bad_src"
shasum -a 256 "$arm_archive" > "$arm_archive.sha256"
assert_failure 'must support arm64' stage aarch64-apple-darwin "$bad_src"
[[ ! -d "$bad_src/binaries" ]]
printf 'macOS hanzod packaging tests passed\n'
