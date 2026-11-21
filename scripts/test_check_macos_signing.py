#!/usr/bin/env python3
"""Self-test for check-macos-signing.py: the real files pass, and each way back fails."""
import importlib.util
import json
import os
import plistlib
import shutil
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TAURI = os.path.join(HERE, "..", "apps", "hanzo-desktop", "src-tauri")
spec = importlib.util.spec_from_file_location("cms", os.path.join(HERE, "check-macos-signing.py"))
cms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cms)


class CheckMacosSigning(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        for name in ["entitlements.plist", "Info.plist"] + [
            os.path.basename(p) for p in os.listdir(TAURI) if p.startswith("tauri") and p.endswith(".json")
        ]:
            shutil.copy(os.path.join(TAURI, name), self.dir)

    def tearDown(self):
        shutil.rmtree(self.dir)

    def edit_plist(self, name, change):
        path = os.path.join(self.dir, name)
        with open(path, "rb") as f:
            data = plistlib.load(f)
        change(data)
        with open(path, "wb") as f:
            plistlib.dump(data, f)

    def edit_json(self, name, change):
        path = os.path.join(self.dir, name)
        with open(path) as f:
            data = json.load(f)
        change(data)
        with open(path, "w") as f:
            json.dump(data, f)

    def fails(self, needle):
        found = cms.problems(self.dir)
        self.assertTrue(any(needle in p for p in found), f"{needle!r} not in {found}")

    def test_the_repo_passes(self):
        self.assertEqual(cms.problems(TAURI), [])

    def test_get_task_allow_fails(self):
        self.edit_plist("entitlements.plist", lambda d: d.update({"com.apple.security.get-task-allow": True}))
        self.fails("get-task-allow")

    def test_each_removed_entitlement_fails(self):
        for key in [
            "com.apple.security.inherit",
            "com.apple.security.network.client",
            "com.apple.security.network.server",
            "com.apple.security.device.bluetooth",
            "com.apple.security.device.camera",
            "com.apple.security.device.print",
            "com.apple.security.device.usb",
            "com.apple.security.personal-information.location",
            "com.apple.security.cs.allow-jit",
            "com.apple.security.cs.allow-unsigned-executable-memory",
            "com.apple.security.cs.disable-executable-page-protection",
            "com.apple.security.cs.allow-dyld-environment-variables",
            "com.apple.security.cs.disable-library-validation",
        ]:
            with self.subTest(key=key):
                shutil.copy(os.path.join(TAURI, "entitlements.plist"), self.dir)
                self.edit_plist("entitlements.plist", lambda d: d.update({key: True}))
                self.fails(key)

    def test_microphone_entitlement_is_required(self):
        self.edit_plist("entitlements.plist", lambda d: d.clear())
        self.fails("audio-input must be True")

    def test_hardened_runtime_off_fails(self):
        self.edit_json("tauri.macos.conf.json", lambda d: d["bundle"]["macOS"].update({"hardenedRuntime": False}))
        self.fails("hardened runtime")

    def test_a_second_entitlements_file_fails(self):
        self.edit_json("tauri.conf.json", lambda d: d["bundle"].setdefault("macOS", {}).update({"entitlements": "debug.plist"}))
        self.fails("belongs in tauri.macos.conf.json alone")

    def test_a_sidecar_fails(self):
        self.edit_json("tauri.conf.json", lambda d: d["bundle"].update({"externalBin": ["bin/deno"]}))
        self.fails("externalBin")

    def test_a_usage_sentence_for_an_unused_resource_fails(self):
        self.edit_plist("Info.plist", lambda d: d.update({"NSCameraUsageDescription": "x"}))
        self.fails("NSCameraUsageDescription")

    def test_the_speech_sentence_is_required(self):
        self.edit_plist("Info.plist", lambda d: d.pop("NSSpeechRecognitionUsageDescription"))
        self.fails("NSSpeechRecognitionUsageDescription needs its sentence")

    def test_an_empty_usage_sentence_fails(self):
        self.edit_plist("Info.plist", lambda d: d.update({"NSMicrophoneUsageDescription": " "}))
        self.fails("NSMicrophoneUsageDescription needs its sentence")

    def test_a_signed_app_matching_the_file_passes(self):
        flags = "CodeDirectory v=20500 size=1 flags=0x10002(adhoc,runtime) hashes=1+7"
        self.assertEqual(cms.app_problems(TAURI, dict(cms.ENTITLEMENTS), flags), [])

    def test_a_signed_app_with_get_task_allow_fails(self):
        signed = {**cms.ENTITLEMENTS, "com.apple.security.get-task-allow": True}
        found = cms.app_problems(TAURI, signed, "flags=0x10002(adhoc,runtime)")
        self.assertTrue(any("get-task-allow" in p for p in found), found)

    def test_a_signed_app_missing_the_microphone_fails(self):
        found = cms.app_problems(TAURI, {}, "flags=0x10002(adhoc,runtime)")
        self.assertTrue(any("audio-input" in p for p in found), found)

    def test_a_signed_app_without_the_hardened_runtime_fails(self):
        found = cms.app_problems(TAURI, dict(cms.ENTITLEMENTS), "flags=0x2(adhoc)")
        self.assertTrue(any("hardened runtime" in p for p in found), found)


@unittest.skipUnless(shutil.which("codesign"), "codesign is macOS-only")
class SignedFixtureApp(unittest.TestCase):
    """A real bundle signed by codesign, read back by the checker the release runs."""

    def sign(self, entitlements, runtime):
        app = os.path.join(self.dir, "Fixture.app")
        shutil.rmtree(app, ignore_errors=True)
        os.makedirs(os.path.join(app, "Contents", "MacOS"))
        shutil.copy("/usr/bin/true", os.path.join(app, "Contents", "MacOS", "Fixture"))
        with open(os.path.join(app, "Contents", "Info.plist"), "wb") as f:
            plistlib.dump({"CFBundleExecutable": "Fixture", "CFBundleIdentifier": "test.fixture", "CFBundlePackageType": "APPL"}, f)
        ent = os.path.join(self.dir, "e.plist")
        with open(ent, "wb") as f:
            plistlib.dump(entitlements, f)
        cmd = ["codesign", "--force", "--sign", "-", "--entitlements", ent] + (["--options", "runtime"] if runtime else []) + [app]
        subprocess.run(cmd, check=True, capture_output=True)
        return cms.app_problems(TAURI, *cms.signed(app))

    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.dir)

    def test_signed_with_the_release_file_passes(self):
        self.assertEqual(self.sign(dict(cms.ENTITLEMENTS), runtime=True), [])

    def test_signed_with_get_task_allow_fails(self):
        found = self.sign({**cms.ENTITLEMENTS, "com.apple.security.get-task-allow": True}, runtime=True)
        self.assertTrue(any("get-task-allow" in p for p in found), found)

    def test_signed_without_the_runtime_fails(self):
        found = self.sign(dict(cms.ENTITLEMENTS), runtime=False)
        self.assertTrue(any("hardened runtime" in p for p in found), found)


if __name__ == "__main__":
    unittest.main()
