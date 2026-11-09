#!/usr/bin/env bash
# Run a command where the sysroot looks installed.
#
#   unshare -Urm overlay.sh <sysroot> <command>...
#
# Tauri's AppImage bundler reads xdg-mime, xdg-open and WebKit's helper processes
# from fixed system paths (/usr/bin, /usr/lib/<triplet>), and a runner without sudo
# cannot put them there. In a user and mount namespace the caller is root of its own
# view of the filesystem, which is enough to mount: /usr/bin and /usr/lib/<triplet>
# are each replaced by a directory of links to the real entries plus whatever the
# sysroot has that the system does not. Nothing outside the namespace changes, and it
# ends with the command.
set -euo pipefail

sysroot=$1; shift
triplet=$(gcc -dumpmachine)
work=$(mktemp -d)

merge() { # <system dir>
  local dir=$1 name real view e
  name=$(printf %s "$dir" | tr / _)
  real=$work/real$name view=$work/view$name
  mkdir -p "$real" "$view"
  mount --bind "$dir" "$real"
  for e in "$real"/* "$real"/.[!.]*; do
    [ -e "$e" ] || [ -L "$e" ] || continue
    ln -s "$e" "$view/${e##*/}"
  done
  for e in "$sysroot$dir"/*; do
    [ -e "$e" ] || [ -L "$e" ] || continue
    [ -e "$view/${e##*/}" ] || [ -L "$view/${e##*/}" ] || ln -s "$e" "$view/${e##*/}"
  done
  mount --bind "$view" "$dir"
}

merge /usr/bin
merge "/usr/lib/$triplet"

# Files the machine's root owns have no owner in this namespace, and `cp -a`, which
# the GTK plugin uses to gather typelibs and schemas, cannot give one to a copy:
# chown answers EINVAL. A copy owned by whoever makes it is what anyone wants here.
mkdir -p "$work/shim"
printf '#!/bin/sh\nexec /usr/bin/cp "$@" --no-preserve=ownership\n' > "$work/shim/cp"
chmod +x "$work/shim/cp"
export PATH=$work/shim:$PATH
exec "$@"
