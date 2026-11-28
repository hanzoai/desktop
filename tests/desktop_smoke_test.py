import json
from pathlib import Path


def test_desktop_manifests_valid():
    root = Path(__file__).resolve().parent.parent
    pkg = json.loads((root / "package.json").read_text(encoding="utf-8"))
    assert "name" in pkg
    assert (root / "Cargo.toml").exists()
    assert (root / "pnpm-workspace.yaml").exists()
    assert (root / "hanzo.yml").exists()
