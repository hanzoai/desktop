#!/usr/bin/env bash
# The toolchain that cross-builds for x86_64-pc-windows-msvc on a Linux runner, shared by
# the release's Windows leg and the pull request's Windows check: NSIS, lld and LLVM
# (clang-cl), cargo-xwin, and the Windows SDK and CRT laid out where cargo-xwin reads them.
# It sets PATH, LD_LIBRARY_PATH, XWIN_CACHE_DIR and PKG_CONFIG_PATH for the steps after it.
#
# Needs RUNNER_TEMP, GITHUB_PATH and GITHUB_ENV (a workflow step has them).
set -euo pipefail
scripts/release/sysroot.sh "$RUNNER_TEMP/sysroot" nsis lld llvm clang
llvm=$RUNNER_TEMP/sysroot/usr/lib/llvm-18
ln -sf clang "$llvm/bin/clang-cl"
[ -e "$llvm/lib/clang" ] || ln -s /usr/lib/llvm-18/lib/clang "$llvm/lib/clang"
echo "$llvm/bin" >> "$GITHUB_PATH"
echo "LD_LIBRARY_PATH=$llvm/lib:${LD_LIBRARY_PATH:-}" >> "$GITHUB_ENV"
mkdir -p "$RUNNER_TEMP/bin"
for tool in cargo-xwin xwin; do
  case $tool in
    cargo-xwin) v=v0.23.1; url=https://github.com/rust-cross/cargo-xwin/releases/download/$v/cargo-xwin-$v.x86_64-unknown-linux-musl.tar.gz; strip=0 ;;
    xwin) v=0.10.0; url=https://github.com/Jake-Shadle/xwin/releases/download/$v/xwin-$v-x86_64-unknown-linux-musl.tar.gz; strip=1 ;;
  esac
  curl -fsSL --retry 5 -o "$RUNNER_TEMP/$tool.tgz" "$url"
  echo "$(curl -fsSL "$url.sha256" | cut -d' ' -f1)  $RUNNER_TEMP/$tool.tgz" | sha256sum -c -
  tar -xzf "$RUNNER_TEMP/$tool.tgz" --strip-components=$strip -C "$RUNNER_TEMP/bin"
done
echo "$RUNNER_TEMP/bin" >> "$GITHUB_PATH"

# The Windows SDK and CRT. cargo-xwin can fetch them itself, and on these pods
# it did not finish in 30 minutes; the xwin it embeds, run alone, takes about
# a minute and a half. So xwin lays the cache out, in the shape cargo-xwin
# reads (<cache>/xwin/{crt,sdk} and a DONE file naming the arches), and
# cargo-xwin finds nothing left to do.
cache=$RUNNER_TEMP/xwin-cache
"$RUNNER_TEMP/bin/xwin" --accept-license --cache-dir "$cache/download" --arch x86_64 --variant desktop \
  splat --output "$cache/xwin"
echo x86_64 > "$cache/xwin/DONE"
echo "XWIN_CACHE_DIR=$cache" >> "$GITHUB_ENV"
mkdir -p "$RUNNER_TEMP/pc"
printf 'Name: ayatana-appindicator3-0.1\nDescription: asked for by tauri-cli on a Linux host, unused by a Windows target\nVersion: 0.5.0\nLibs: -L/usr/lib -layatana-appindicator3\n' \
  > "$RUNNER_TEMP/pc/ayatana-appindicator3-0.1.pc"
echo "PKG_CONFIG_PATH=$RUNNER_TEMP/pc:${PKG_CONFIG_PATH:-}" >> "$GITHUB_ENV"
