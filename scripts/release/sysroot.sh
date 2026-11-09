#!/usr/bin/env bash
# Install Debian packages into a prefix this user owns, for a runner that cannot sudo.
#
#   sysroot.sh [-b] <prefix> <package>...
#
# apt resolves against this machine's dpkg status and downloads the .debs it would
# install into a cache under <prefix>; nothing is configured and no package script
# runs. A package the machine already has stays the machine's: only what is missing
# is unpacked, so the prefix never shadows a library the system provides. Then the
# prefix is made usable where it sits: .pc files name it, and a development symlink
# whose library lives in the system is pointed there.
#
# Appends to $GITHUB_ENV and $GITHUB_PATH, when they exist, what a later step needs
# to run the prefix's programs. With -b it also appends what a C build needs to find
# its headers and libraries: pkg-config's path, the compiler's include and link paths.
set -euo pipefail

build=0
[ "${1:-}" != -b ] || { build=1; shift; }
prefix=$1; shift
mkdir -p "$prefix"; prefix=$(cd "$prefix" && pwd)
triplet=$(gcc -dumpmachine)
state=$prefix/.apt
mkdir -p "$state/lists/partial" "$state/archives/partial"

codename=$(. /etc/os-release && echo "$VERSION_CODENAME")
arch=$(dpkg --print-architecture)
sources=$state/sources.list
apt=(apt-get -q -o Dir::State="$state" -o Dir::State::lists="$state/lists"
     -o Dir::Cache="$state" -o Dir::Cache::archives="$state/archives"
     -o Dir::State::status=/var/lib/dpkg/status -o Debug::NoLocking=1 -o APT::Sandbox::User=
     -o Dir::Etc::sourcelist="$sources" -o Dir::Etc::sourceparts=/dev/null
     -o Acquire::Retries=5 -o Acquire::ForceIPv4=true -o Acquire::http::Timeout=20)

# The archive's own host first, then kernel.org's mirror of it. From a cluster's
# shared egress address either has been seen to time out for minutes, and apt takes
# an unreachable mirror for a warning and an empty index.
for try in 1 2 3; do
  case $arch:$try in
    amd64:1) base=http://archive.ubuntu.com/ubuntu ;;
    amd64:*) base=https://mirrors.edge.kernel.org/ubuntu ;;
    *:1) base=http://ports.ubuntu.com/ubuntu-ports ;;
    *) base=https://mirrors.edge.kernel.org/ubuntu-ports ;;
  esac
  for pocket in "" -updates -security; do
    echo "deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] $base $codename$pocket main universe"
  done > "$sources"
  "${apt[@]}" update -o APT::Update::Error-Mode=any >/dev/null && break
  [ "$try" -lt 3 ] || { echo "sysroot: apt update failed three times" >&2; exit 1; }
  sleep 5
done
"${apt[@]}" install --download-only -y --no-install-recommends "$@" >/dev/null

unpacked=0; kept=0
for deb in "$state"/archives/*.deb; do
  name=$(dpkg-deb -f "$deb" Package); arch=$(dpkg-deb -f "$deb" Architecture)
  [ "$arch" = all ] || name=$name:$arch
  if [ "$(dpkg-query -W -f='${db:Status-Status}' "$name" 2>/dev/null || true)" = installed ]; then
    kept=$((kept + 1)); continue
  fi
  dpkg-deb -x "$deb" "$prefix"; unpacked=$((unpacked + 1))
done
echo "sysroot: $unpacked packages unpacked into $prefix, $kept already on the machine"

# Older packages ship under /lib; one tree is easier to point at.
if [ -d "$prefix/lib" ] && [ ! -L "$prefix/lib" ]; then
  mkdir -p "$prefix/usr/lib"; cp -a "$prefix/lib/." "$prefix/usr/lib/"; rm -rf "$prefix/lib"
fi

# pkg-config answers with paths under /usr; make them paths under the prefix. The files
# as shipped are kept in .pc/, for the one consumer that wants /usr (overlay.sh).
find "$prefix/usr" -type f -name '*.pc' | while read -r pc; do
  mkdir -p "$prefix/.pc/$(dirname "${pc#"$prefix"/}")"
  cp "$pc" "$prefix/.pc/${pc#"$prefix"/}"
done
find "$prefix/usr" -type f -name '*.pc' -exec sed -i \
  -e "s|=/usr|=$prefix/usr|g" -e "s|-I/usr|-I$prefix/usr|g" -e "s|-L/usr|-L$prefix/usr|g" {} +

# A link from a package the prefix holds to a file of one the machine already had
# (libfoo.so -> libfoo.so.0.N, or /usr/bin/glib-compile-schemas -> ../lib/.../glib-2.0/
# glib-compile-schemas) points at nothing in the prefix. Resolved the way it would be
# once installed, it is a file on the machine: link to that.
find "$prefix/usr" -xtype l | while read -r link; do
  target=$(readlink "$link")
  case $target in /*) installed=$target ;; *) installed=$(realpath -m "$(dirname "${link#"$prefix"}")/$target") ;; esac
  if [ -e "$installed" ]; then ln -sfn "$installed" "$link"; fi
done
broken() { find "$prefix/usr/bin" "$prefix/usr/lib" -xtype l 2>/dev/null || true; }
dangling=$(broken | wc -l)
[ "$dangling" -eq 0 ] || { broken | head; echo "sysroot: $dangling links point nowhere" >&2; exit 1; }

lib=$prefix/usr/lib/$triplet
add() { [ -z "${GITHUB_ENV:-}" ] || echo "$1=$2" >> "$GITHUB_ENV"; }
add SYSROOT "$prefix"
add NSISDIR "$prefix/usr/share/nsis"
add LD_LIBRARY_PATH "$lib:$prefix/usr/lib:${LD_LIBRARY_PATH:-}"
if [ "$build" -eq 1 ]; then
  add PKG_CONFIG_PATH "$lib/pkgconfig:$prefix/usr/lib/pkgconfig:$prefix/usr/share/pkgconfig:${PKG_CONFIG_PATH:-}"
  add LIBRARY_PATH "$lib:$prefix/usr/lib:${LIBRARY_PATH:-}"
  add CPATH "$prefix/usr/include:$prefix/usr/include/$triplet:${CPATH:-}"
fi
[ -z "${GITHUB_PATH:-}" ] || echo "$prefix/usr/bin" >> "$GITHUB_PATH"
