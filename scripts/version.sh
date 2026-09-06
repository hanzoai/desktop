#!/usr/bin/env bash
# The version of Hanzo Desktop — is the declared one still true, and is it still
# declared in exactly ONE place?
#
#   scripts/version.sh published   # the highest version already released
#   scripts/version.sh check       # the invariant (default)
#
# WHAT SHIPS HERE IS NOT A CONTAINER. hanzoai/chat and hanzoai/app publish an
# image and derive the number from the registry; this repo publishes signed
# per-platform Tauri bundles to GitHub Releases + R2. So "published" is the
# newest GitHub Release, and the release is cut FROM A TAG a human pushes.
#
# THE MODEL IS THEREFORE THE MIRROR OF THE OTHER TWO, and this is deliberate:
#   chat / app  — CI computes the number, CI writes it, declared == published.
#   desktop     — a human writes the number, then tags it; declared LEADS
#                 published by exactly the release being prepared.
# Measured 2026-08-06: declared 1.1.49, released 1.1.48. That is the CORRECT
# state for this model, not drift — 1.1.49 is the number the next tag must carry.
#
# ONE INVARIANT COVERS BOTH MODELS: the declared version must never be BEHIND
# the highest published version. Equal (chat/app, CI wrote it) and one ahead
# (here, a human is preparing it) both pass; sinking below what already shipped
# is the failure, and it is the one that actually happened.
#
# AND ON A TAG, EQUALITY IS EXACT. `.github/workflows/release-prod.yml` carried a
# "Check version match" step that failed the release when the tag and
# package.json disagreed. It was deleted with the rest of GitHub CI on
# 2026-07-27 and never re-homed, so nothing has asserted it since. It is the
# `GITHUB_REF_TYPE=tag` branch below.
#
# THE SINGLE SOURCE IS THE ROOT package.json, and the checks below are what keep
# it single. Tauri reads it by PATH (`"version": "../../../package.json"` in
# tauri.conf.json), src-tauri/Cargo.toml stays an inert 0.0.0 placeholder, and
# apps/hanzo-desktop/package.json declares no version at all. Every one of those
# is a place a number could be typed a second time and then disagree, which is
# how a bundle comes to report a version its repo never released.
#
# ENV: GH_PAT / GITHUB_TOKEN raise the API rate limit. The releases endpoint is
#      public, so the read works without either.
set -euo pipefail

cd "$(dirname "$0")/.."

semver='^[0-9]+\.[0-9]+\.[0-9]+$'

git_max() {
  git tag -l | sed 's/^v//' | grep -E "$semver" | sort -V | tail -1 || true
}

release_max() {
  local tok="${GH_PAT:-${GITHUB_TOKEN:-}}"
  # Positional params, not an array: under `set -u` bash 3.2 (every macOS) treats
  # "${arr[@]}" on an EMPTY array as unbound and aborts the function — which
  # returned no releases at all while git tags quietly covered for it. "$@" with
  # zero args is safe on every shell.
  set -- -fsSL -H "Accept: application/vnd.github+json"
  [ -n "$tok" ] && set -- "$@" -H "Authorization: Bearer $tok"
  curl "$@" \
      'https://api.github.com/repos/hanzoai/desktop/releases?per_page=100' 2>/dev/null \
    | jq -r '.[] | select(.draft | not) | .tag_name' 2>/dev/null \
    | sed 's/^v//' | grep -E "$semver" | sort -V | tail -1 || true
}

published() {
  printf '%s\n%s\n%s\n' "0.0.0" "$(git_max)" "$(release_max)" \
    | grep -E "$semver" | sort -V | tail -1
}

declared() { jq -r '.version // ""' package.json; }

# `a` is at least `b` — string-equal, or the larger of the two under sort -V.
at_least() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | tail -1)" = "$1" ]; }

fail() { echo "::error::$1" >&2; shift; for l in "$@"; do echo "  $l" >&2; done; exit 1; }

case "${1:-check}" in
  published) published ;;

  check)
    dec="$(declared)"
    echo "$dec" | grep -qE "$semver" \
      || fail "root package.json declares '${dec}', which is not a semver." \
              "Tauri reads this file for the bundle version; a non-semver is not installable."

    # ---- one number, one place ----------------------------------------------
    ptr="$(jq -r '.version // ""' apps/hanzo-desktop/src-tauri/tauri.conf.json)"
    [ "$ptr" = "../../../package.json" ] \
      || fail "tauri.conf.json version is '${ptr}', not a pointer at the root package.json." \
              "A literal here is a SECOND declaration, and the bundle would report it" \
              "while the repo, the tag and the release reported the other one."

    dup="$(jq -r '.version // ""' apps/hanzo-desktop/package.json)"
    [ -z "$dup" ] \
      || fail "apps/hanzo-desktop/package.json declares version '${dup}'." \
              "Nothing reads it (the package is private and Tauri resolves the ROOT" \
              "package.json), so it can only ever agree by luck or disagree in silence."

    cargo="$(sed -n '/^\[package\]/,/^\[/p' apps/hanzo-desktop/src-tauri/Cargo.toml \
             | sed -n 's/^version *= *"\([^"]*\)".*/\1/p' | head -1)"
    [ "$cargo" = "0.0.0" ] \
      || fail "src-tauri/Cargo.toml declares version '${cargo}', not the inert 0.0.0." \
              "tauri.conf.json's pointer overrides it for the bundle, so a real number" \
              "here is a third source that looks authoritative and governs nothing."

    # ---- never behind what shipped ------------------------------------------
    pub="$(published)"
    at_least "$dec" "$pub" \
      || fail "package.json says ${dec} but ${pub} is already released — the declared version is BEHIND what shipped." \
              "A release is cut FROM this number; below the last one it cannot be tagged." \
              "Fix: set package.json version to at least ${pub}."

    # ---- on a tag, exactly equal (the deleted release-prod.yml gate) --------
    if [ "${GITHUB_REF_TYPE:-}" = "tag" ]; then
      tag="${GITHUB_REF_NAME#v}"
      [ "$tag" = "$dec" ] \
        || fail "tag ${GITHUB_REF_NAME} does not match package.json ${dec}." \
                "The bundle takes its version from package.json, so this release would" \
                "ship installers, update manifests and an R2 path that all disagree with" \
                "the tag that produced them."
      echo "version.sh: tag ${GITHUB_REF_NAME} == declared ${dec} — OK"
    fi

    echo "version.sh: declared=${dec} published=${pub} — one source, not behind. OK"
    ;;

  *) echo "usage: scripts/version.sh [published|check]" >&2; exit 2 ;;
esac
