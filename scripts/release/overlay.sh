#!/usr/bin/env bash
# Run a command where the sysroot looks installed.
#
#   unshare -Urm overlay.sh <sysroot> <command>...
#
# Tauri's AppImage bundler reads xdg-mime, xdg-open and WebKit's helper processes from
# fixed system paths, and the GTK plugin it drives copies GTK's modules, schemas and
# typelibs from wherever pkg-config says /usr is. A runner without sudo cannot put
# anything there. In a user and mount namespace the caller is root of its own view of
# the filesystem, which is enough to mount: /usr/bin, /usr/lib/<triplet> and /usr/share
# are each replaced by a tree of links to the machine's files plus whatever the sysroot
# has that the machine does not. Nothing outside the namespace changes, and it ends
# with the command.
set -euo pipefail

sysroot=$1; shift
triplet=$(gcc -dumpmachine)
work=$(mktemp -d)

merge() { # <system dir> [<alias>=<name>]...
  local dir=$1 name real view alias
  name=$(printf %s "$dir" | tr / _)
  real=$work/real$name view=$work/view$name
  mkdir -p "$real" "$view"
  mount --bind "$dir" "$real"
  cp -rs "$real/." "$view/"
  [ ! -d "$sysroot$dir" ] || cp -rs --update=none "$sysroot$dir/." "$view/"
  shift
  for alias in "$@"; do
    if [ -e "$view/${alias#*=}" ] && [ ! -e "$view/${alias%%=*}" ]; then ln -s "${alias#*=}" "$view/${alias%%=*}"; fi
  done
  mount --bind "$view" "$dir"
}

# Links a package's install script makes, which no script ran to make:
#   libgtk-3-0       the GTK plugin looks for gtk-query-immodules-3.0 in libgtk-3-0/;
#                    Ubuntu 24.04 renamed the package, and the directory, libgtk-3-0t64.
#   libblas.so.3,    update-alternatives points them into blas/ and lapack/, and
#   liblapack.so.3   gstreamer1.0-libav needs both.
merge /usr/bin
merge "/usr/lib/$triplet" libgtk-3-0=libgtk-3-0t64 libblas.so.3=blas/libblas.so.3 liblapack.so.3=lapack/liblapack.so.3
merge /usr/share

# The prefix's .pc files name the prefix, which is what a build outside the namespace
# wants. Here the prefix is /usr, and the plugin derives where to copy from by
# comparing what pkg-config says with where it looks, so it gets the files as shipped.
export PKG_CONFIG_PATH=$sysroot/.pc/usr/lib/$triplet/pkgconfig:$sysroot/.pc/usr/lib/pkgconfig:$sysroot/.pc/usr/share/pkgconfig:${PKG_CONFIG_PATH:-}
unset LIBRARY_PATH CPATH

# Files the machine's root owns have no owner in this namespace, and `cp -a`, which
# the GTK plugin uses to gather typelibs and schemas, cannot give one to a copy:
# chown answers EINVAL. A copy owned by whoever makes it is what anyone wants here.
mkdir -p "$work/shim"
printf '#!/bin/sh\nexec /usr/bin/cp "$@" --no-preserve=ownership\n' > "$work/shim/cp"
chmod +x "$work/shim/cp"
export PATH=$work/shim:$PATH
exec "$@"
