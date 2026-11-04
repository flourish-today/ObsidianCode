import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("collector", Path(__file__).with_name("collect-licenses.py"))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class LicenseCollectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.upstream = self.root / "upstream"
        self.module = self.root / "tailscale"
        self.goroot = self.root / "go"
        for root in (self.upstream, self.module, self.goroot):
            root.mkdir()
            (root / "LICENSE").write_text(f"License for {root.name}\n")
        (self.module / "third_party").mkdir()
        (self.module / "third_party/NOTICE.txt").write_text("Nested attribution\n")
        (self.module / "license_test.go").write_text("Not a license document\n")
        (self.goroot / "src").mkdir()
        (self.goroot / "src/LICENSE").write_text("Go bundled notice\n")
        self.data = self.root / "packages.json"
        self.output = self.root / "out/THIRD-PARTY-NOTICES.txt"
        self.package = {"ImportPath": "tailscale.com/tsnet", "Module": {
            "Path": "tailscale.com", "Version": "v1.104.2", "Dir": str(self.module),
        }}
        self.go = patch.object(collector.subprocess, "check_output", side_effect=[
            str(self.goroot), "go1.27.3",
        ])
        self.go.start()
        self.addCleanup(self.go.stop)

    def write_packages(self, *packages):
        self.data.write_text("\n".join(json.dumps(package) for package in packages))

    def collect(self):
        collector.collect(self.upstream, self.data, self.output)

    def test_versions_nested_notices_and_duplicate_modules(self):
        self.write_packages({"ImportPath": "fmt", "Standard": True}, self.package, self.package)
        self.collect()
        text = self.output.read_text()
        self.assertIn("tailscale.com v1.104.2 / third_party/NOTICE.txt", text)
        self.assertIn("Nested attribution", text)
        self.assertIn("Go bundled notice", text)
        self.assertIn("Go standard library and runtime go1.27.3", text)
        self.assertIn("AndroidX WebKit 1.14.0", text)
        self.assertIn("Apache License", text)
        self.assertNotIn("Not a license document", text)
        self.assertEqual(text.count("License for tailscale"), 1)

    def test_missing_module_license_fails_before_writing(self):
        (self.module / "LICENSE").unlink()
        self.write_packages(self.package)
        with self.assertRaisesRegex(ValueError, "No license found"):
            self.collect()
        self.assertFalse(self.output.exists())

    def test_incomplete_data_fails(self):
        self.write_packages({"ImportPath": "broken", "DepsErrors": [{"Err": "missing"}]})
        with self.assertRaisesRegex(ValueError, "Incomplete dependency data"):
            self.collect()

    def test_tailscale_must_be_present(self):
        self.write_packages({"ImportPath": "fmt", "Standard": True})
        with self.assertRaisesRegex(ValueError, "Tailscale missing"):
            self.collect()


if __name__ == "__main__":
    unittest.main()
