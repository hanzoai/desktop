#!/usr/bin/env python3
"""What the macOS bundle is signed with, held to what the app uses.

    check-macos-signing.py [--app <built .app>] [src-tauri dir]

Fails, naming each problem, when:
- entitlements.plist holds anything but ENTITLEMENTS (get-task-allow is the one
  Apple's notary service rejects outright; the rest were never used);
- the macOS config stops pointing at it, turns the hardened runtime off, or any
  other tauri*.json names entitlements or the runtime (one file, one switch);
- an externalBin comes back: Tauri signs every sidecar with the app's own
  entitlements, so a sidecar that needs others (deno's JIT) cannot get them;
- Info.plist's usage sentences are not exactly USAGE, or one is empty;
- with --app (macOS, after the build signs it): the bundle's signed entitlements
  differ from entitlements.plist, or it was signed without the hardened runtime.
"""
import glob
import json
import os
import plistlib
import subprocess
import sys

ENTITLEMENTS = {"com.apple.security.device.audio-input": True}
USAGE = {
    "NSMicrophoneUsageDescription",
    "NSSpeechRecognitionUsageDescription",
    "NSLocalNetworkUsageDescription",
    "NSDocumentsFolderUsageDescription",
    "NSDesktopFolderUsageDescription",
    "NSDownloadsFolderUsageDescription",
}


def problems(tauri):
    out = []
    with open(os.path.join(tauri, "entitlements.plist"), "rb") as f:
        ent = plistlib.load(f)
    for key in sorted(set(ent) - set(ENTITLEMENTS)):
        out.append(f"entitlements.plist: {key} is not used by the app")
    for key, value in ENTITLEMENTS.items():
        if ent.get(key) is not value:
            out.append(f"entitlements.plist: {key} must be {value}")

    for path in sorted(glob.glob(os.path.join(tauri, "tauri*.json"))):
        name = os.path.basename(path)
        with open(path) as f:
            conf = json.load(f)
        bundle = conf.get("bundle", {})
        mac = bundle.get("macOS", {})
        if name == "tauri.macos.conf.json":
            if mac.get("entitlements") != "entitlements.plist":
                out.append(f"{name}: bundle.macOS.entitlements must be entitlements.plist")
            if mac.get("hardenedRuntime", True) is not True:
                out.append(f"{name}: the hardened runtime must stay on")
        else:
            for key in ("entitlements", "hardenedRuntime"):
                if key in mac:
                    out.append(f"{name}: bundle.macOS.{key} belongs in tauri.macos.conf.json alone")
        if bundle.get("externalBin"):
            out.append(f"{name}: externalBin is signed with the app's entitlements; give a sidecar its own signing first")

    with open(os.path.join(tauri, "Info.plist"), "rb") as f:
        info = plistlib.load(f)
    usage = {k for k in info if k.endswith("UsageDescription")}
    for key in sorted(usage - USAGE):
        out.append(f"Info.plist: {key} names a resource the app does not use")
    for key in sorted(USAGE):
        if not str(info.get(key, "")).strip():
            out.append(f"Info.plist: {key} needs its sentence")
    return out


def signed(app):
    """The entitlements a built bundle is signed with, and its CodeDirectory flags line, as codesign reads them."""
    xml = subprocess.run(["codesign", "-d", "--entitlements", "-", "--xml", app], capture_output=True, check=True).stdout
    info = subprocess.run(["codesign", "-dv", app], capture_output=True, text=True, check=True).stderr
    flags = next((line for line in info.splitlines() if "flags=" in line), "")
    return (plistlib.loads(xml) if xml.strip() else {}), flags


def app_problems(tauri, entitlements, flags):
    """A signed bundle held to the file it should have been signed with."""
    out = []
    with open(os.path.join(tauri, "entitlements.plist"), "rb") as f:
        want = plistlib.load(f)
    for key in sorted(set(entitlements) | set(want)):
        if entitlements.get(key) != want.get(key):
            out.append(f"signed app: {key} is {entitlements.get(key)}, entitlements.plist says {want.get(key)}")
    if "runtime" not in flags.split("(", 1)[-1]:
        out.append(f"signed app: signed without the hardened runtime ({flags.strip() or 'no flags'})")
    return out


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    args = sys.argv[1:]
    app = None
    if args[:1] == ["--app"]:
        app, args = args[1], args[2:]
    tauri = args[0] if args else os.path.join(here, "..", "apps", "hanzo-desktop", "src-tauri")
    found = problems(tauri)
    if app:
        found += app_problems(tauri, *signed(app))
    for p in found:
        print(p, file=sys.stderr)
    sys.exit(1 if found else 0)
