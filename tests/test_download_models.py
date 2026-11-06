"""Offline tests for download_models.py. Network access is mocked; no model files are downloaded."""
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import download_models as downloader


class DownloadTests(unittest.TestCase):
    """Download, verification, manifest and command-line behavior, using a temporary models folder."""

    def setUp(self):
        """Creates a temporary models folder and a catalog reduced to the tiny tier."""
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        with open(Path(downloader.ROOT) / "catalog.json", encoding="utf-8") as source:
            self.catalog = json.load(source)
        self.catalog["tiers"] = {"tiny": self.catalog["tiers"]["tiny"]}
        self.tier = self.catalog["tiers"]["tiny"]

    def write(self, relative, content=b"test"):
        """Writes a file inside the temporary models folder and returns its path."""
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def complete_gguf(self):
        """Creates a fake, complete tiny GGUF build and returns its folder."""
        model = self.tier["gguf"]
        folder = Path(downloader.gguf_dir(str(self.root), model["file"]))
        for name in (model["file"], "LICENSE", "ATTRIBUTION.txt", ".complete"):
            self.write(str(folder.relative_to(self.root) / name))
        return folder

    def test_marker_alone_does_not_advertise_model(self):
        """A .complete marker without the model file must not appear in the manifest."""
        folder = self.complete_gguf()
        (folder / self.tier["gguf"]["file"]).unlink()
        manifest = downloader.build_manifest(str(self.root), self.catalog)
        self.assertEqual(manifest["gguf"], {})

    def test_check_is_offline_and_accepts_complete_model(self):
        """--check passes for a complete build without touching the network."""
        self.complete_gguf()
        downloader.build_manifest(str(self.root), self.catalog)
        with patch.object(downloader, "request", side_effect=AssertionError("network")):
            self.assertEqual(downloader.check_models(str(self.root), self.catalog, ["tiny"], ["gguf"], []), [])

    def test_inventory_detects_same_model_truncation(self):
        """A file shorter than its inventory size is reported."""
        folder = self.complete_gguf()
        downloader.write_inventory(str(folder), {self.tier["gguf"]["file"]: 50})
        self.assertTrue(any("Size mismatch" in item for item in downloader.model_problems(
            str(folder), gguf=self.tier["gguf"]["file"])))

    def test_download_skips_verified_file(self):
        """A file with the expected size and hash is not downloaded again."""
        path = self.write("model.bin")
        with patch.object(downloader, "request", side_effect=AssertionError("network")):
            downloader.download("unused", str(path), 4, hashlib.sha256(b"test").hexdigest())

    def test_interrupted_build_reuses_completed_files_of_same_revision(self):
        """After an interruption, files already fetched for the same revision are reused."""
        path = self.write("model.bin")
        self.write("model.bin.revision", b"pinned-revision")
        with patch.object(downloader, "request", side_effect=AssertionError("network")):
            downloader.download("unused", str(path), 4, force=True, source_revision="pinned-revision")

    def test_changed_revision_refetches_even_if_size_matches(self):
        """A file from an older revision is replaced even if its size happens to match."""
        path = self.write("model.bin", b"old!")
        self.write("model.bin.revision", b"old-revision")
        response = io.BytesIO(b"new!")
        response.headers = {}
        with patch.object(downloader, "request", return_value=response):
            downloader.download("unused", str(path), 4, force=True, source_revision="new-revision")
        self.assertEqual(path.read_bytes(), b"new!")
        self.assertEqual(Path(str(path) + ".revision").read_text(), "new-revision")

    def test_hash_failure_preserves_existing_file(self):
        """A download with the wrong fingerprint is rejected and the old file is kept."""
        path = self.write("library.wasm", b"old")
        response = io.BytesIO(b"new")
        response.headers = {}
        with patch.object(downloader, "request", return_value=response):
            with self.assertRaisesRegex(RuntimeError, "SHA-256"):
                downloader.download("unused", str(path), expected_sha256="not-the-hash")
        self.assertEqual(path.read_bytes(), b"old")

    def test_profile_revision_and_size_are_checked(self):
        """--check with a profile reports a different revision and a wrong GGUF size."""
        self.complete_gguf()
        downloader.build_manifest(str(self.root), self.catalog)
        model = self.tier["gguf"]
        profile = {"revisions": {model["repo"]: "different"}, "ggufSizes": {model["file"]: 99}}
        problems = downloader.check_models(str(self.root), self.catalog, ["tiny"], ["gguf"], [], profile)
        self.assertTrue(any("Revision mismatch" in item for item in problems))
        self.assertTrue(any("Size mismatch" in item for item in problems))

    def test_pinned_repo_does_not_resolve_main(self):
        """A pinned revision is used directly instead of asking for the latest one."""
        response = io.BytesIO(b'[{"type":"file","path":"model.bin","size":4}]')
        response.headers = {}
        with patch.object(downloader, "request", return_value=response) as request:
            revision, sizes = downloader.repo_info("owner/repo", "abc123")
        self.assertEqual(revision, "abc123")
        self.assertEqual(sizes, {"model.bin": 4})
        self.assertIn("/tree/abc123?", request.call_args.args[0])

    def test_paths_cannot_escape_model_directory(self):
        """Repository paths like ../outside are refused."""
        with self.assertRaises(ValueError):
            downloader.safe_path(str(self.root), "../outside")

    def test_profile_covers_exact_catalog_builds(self):
        """The classroom profile pins every catalog build with a revision, size or fingerprint."""
        with open(Path(downloader.ROOT) / "model-downloads.json", encoding="utf-8") as source:
            profile = json.load(source)["classroom"]
        with open(Path(downloader.ROOT) / "catalog.json", encoding="utf-8") as source:
            catalog = json.load(source)
        self.assertEqual(profile["tiers"], list(catalog["tiers"]))
        self.assertEqual(len(profile["revisions"]), len(catalog["tiers"]) * (len(profile["variants"]) + 1))
        for tier_key in profile["tiers"]:
            model = catalog["tiers"][tier_key]
            self.assertRegex(profile["revisions"][model["gguf"]["repo"]], r"^[0-9a-f]{40}$")
            self.assertGreater(profile["ggufSizes"][model["gguf"]["file"]], 0)
            for variant in profile["variants"]:
                gpu = model["webllm"][variant]
                self.assertRegex(profile["revisions"][f"mlc-ai/{gpu['id']}"], r"^[0-9a-f]{40}$")
                self.assertRegex(profile["librarySha256"][gpu["lib"]], r"^[0-9a-f]{64}$")

    def test_profile_rejects_conflicting_filters(self):
        """--profile together with --tiers is a usage error."""
        with patch("sys.argv", ["download_models.py", "--profile", "classroom", "--tiers", "tiny"]):
            with patch("sys.stderr", new_callable=io.StringIO):
                with self.assertRaises(SystemExit) as result:
                    downloader.main()
        self.assertEqual(result.exception.code, 2)

    def test_failed_build_does_not_prevent_later_jobs(self):
        """One failed build still lets the others run, writes the manifest and returns exit code 1."""
        with patch("sys.argv", ["download_models.py", "--tiers", "tiny", "--dest", str(self.root)]):
            with patch.object(downloader, "fetch_webllm", side_effect=[RuntimeError("test failure"), None]) as gpu:
                with patch.object(downloader, "fetch_gguf") as cpu:
                    with patch("sys.stderr", new_callable=io.StringIO):
                        self.assertEqual(downloader.main(), 1)
        self.assertEqual(gpu.call_count, 2)
        cpu.assert_called_once()
        self.assertTrue((self.root / "manifest.json").exists())

    def test_missing_webllm_shard_is_not_advertised(self):
        """A WebLLM build missing a weight shard must not appear in the manifest."""
        model = self.tier["webllm"]["f16"]
        folder = Path(downloader.webllm_dir(str(self.root), model["id"]))
        relative = folder.relative_to(self.root)
        for name in ("LICENSE", "ATTRIBUTION.txt", ".complete", "resolve/main/tokenizer.json", "resolve/main/mlc-chat-config.json"):
            self.write(str(relative / name))
        index = {"records": [{"dataPath": "params_shard_0.bin", "nbytes": 4}]}
        self.write(str(relative / "resolve/main/ndarray-cache.json"), json.dumps(index).encode())
        self.write(f"webllm/libs/{model['lib']}")
        self.assertEqual(downloader.build_manifest(str(self.root), self.catalog)["webllm"], {})


if __name__ == "__main__":
    unittest.main()