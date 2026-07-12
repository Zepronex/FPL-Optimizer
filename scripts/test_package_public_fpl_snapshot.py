from __future__ import annotations

import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from pipelines.databricks.transforms import dataset_snapshot_hash, read_ingestion_dataset
from scripts.prepare_databricks_snapshot import (
    HISTORY_FILENAME,
    METADATA_FILENAME,
    OUTPUT_FILENAMES,
    PACKAGED_FILENAMES,
    package_public_fpl_snapshot,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FIXTURE = REPO_ROOT / "fixtures" / "databricks" / "public_fpl_snapshot"


class PackagePublicFplSnapshotTests(unittest.TestCase):
    def test_committed_fixture_is_public_labeled_and_hash_verified(self) -> None:
        metadata = read_json(PUBLIC_FIXTURE / METADATA_FILENAME)

        self.assertEqual(metadata["dataClassification"], "public")
        self.assertEqual(metadata["datasetType"], "public-fpl")
        self.assertEqual(metadata["snapshotType"], "deterministic-public-fpl-test-fixture")
        self.assertTrue(metadata["isTestFixture"])
        self.assertTrue(metadata["isSubset"])
        self.assertEqual(metadata["effectiveSeason"], "2025-26")
        self.assertEqual(metadata["seasonSource"], "derived-from-event-deadlines")
        self.assertEqual(metadata["preparedAt"], metadata["capturedAt"])
        self.assertEqual(metadata["sourceGeneratedAt"], metadata["captureTimestamps"]["normalizedSnapshotGeneratedAt"])
        self.assertEqual(metadata["historyGeneratedAt"], metadata["captureTimestamps"]["playerHistoryGeneratedAt"])
        self.assertIn("not full historical-dataset evidence", metadata["fixture"]["metricsQualification"])
        self.assertIn("not full-dataset evidence", metadata["fixtureDescription"])
        self.assertEqual(
            metadata["canonicalSnapshotHash"],
            dataset_snapshot_hash(read_ingestion_dataset(PUBLIC_FIXTURE)),
        )
        self.assertEqual(metadata["sourceSnapshotHash"], metadata["canonicalSnapshotHash"])
        self.assertEqual(metadata["recordCounts"]["historyRows"], 64)

        listed_files = {entry["filename"]: entry for entry in metadata["files"]}
        self.assertEqual(set(listed_files), set(PACKAGED_FILENAMES))
        for filename in PACKAGED_FILENAMES:
            file_path = PUBLIC_FIXTURE / filename
            self.assertEqual(listed_files[filename]["sha256"], sha256_file(file_path))
            self.assertEqual(listed_files[filename]["bytes"], file_path.stat().st_size)
            self.assertEqual(metadata["fileSha256"][filename], listed_files[filename]["sha256"])
        self.assertEqual(metadata["historyCaptureHash"], metadata["fileSha256"][HISTORY_FILENAME])

        serialized = json.dumps(metadata, sort_keys=True)
        self.assertNotIn(str(REPO_ROOT), serialized)
        self.assertNotIn("/Users/", serialized)
        self.assertNotIn("\\Users\\", serialized)

    def test_full_package_copies_only_allowlisted_public_files_byte_for_byte(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            source = root / "source"
            output = root / "output"
            shutil.copytree(PUBLIC_FIXTURE, source)
            (source / "unrelated-local-file.txt").write_text("not part of the public package\n", encoding="utf-8")

            metadata = package_public_fpl_snapshot(
                source,
                source / HISTORY_FILENAME,
                output,
            )

            self.assertEqual({entry.name for entry in output.iterdir()}, set(OUTPUT_FILENAMES))
            self.assertFalse((output / "unrelated-local-file.txt").exists())
            for filename in PACKAGED_FILENAMES:
                self.assertEqual((output / filename).read_bytes(), (source / filename).read_bytes())
            self.assertEqual(metadata["effectiveSeason"], "2025-26")
            self.assertEqual(metadata["seasonSource"], "derived-from-event-deadlines")
            self.assertEqual(
                metadata["canonicalSnapshotHash"],
                dataset_snapshot_hash(read_ingestion_dataset(source)),
            )

            serialized = (output / METADATA_FILENAME).read_text(encoding="utf-8")
            self.assertNotIn(str(root), serialized)

    def test_packaging_same_inputs_twice_is_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            first_output = root / "first"
            second_output = root / "second"

            package_public_fpl_snapshot(
                PUBLIC_FIXTURE,
                PUBLIC_FIXTURE / HISTORY_FILENAME,
                first_output,
            )
            package_public_fpl_snapshot(
                PUBLIC_FIXTURE,
                PUBLIC_FIXTURE / HISTORY_FILENAME,
                second_output,
            )

            for filename in OUTPUT_FILENAMES:
                self.assertEqual(
                    (first_output / filename).read_bytes(),
                    (second_output / filename).read_bytes(),
                    filename,
                )

    def test_test_fixture_derivation_is_balanced_referentially_valid_and_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            first_output = root / "first"
            second_output = root / "second"
            kwargs = {
                "test_fixture": True,
                "fixture_player_limit": 4,
                "fixture_gameweek_limit": 4,
            }

            first_metadata = package_public_fpl_snapshot(
                PUBLIC_FIXTURE,
                PUBLIC_FIXTURE / HISTORY_FILENAME,
                first_output,
                **kwargs,
            )
            second_metadata = package_public_fpl_snapshot(
                PUBLIC_FIXTURE,
                PUBLIC_FIXTURE / HISTORY_FILENAME,
                second_output,
                **kwargs,
            )

            self.assertEqual(first_metadata, second_metadata)
            self.assertEqual(first_metadata["recordCounts"]["players"], 4)
            self.assertEqual(first_metadata["recordCounts"]["historyRows"], 16)
            self.assertEqual(first_metadata["fixture"]["selection"]["selectedGameweekIds"], [1, 2, 3, 4])
            positions = {player["position"] for player in read_json(first_output / "players.json")}
            self.assertEqual(positions, {"GK", "DEF", "MID", "FWD"})
            self.assertEqual(
                first_metadata["canonicalSnapshotHash"],
                dataset_snapshot_hash(read_ingestion_dataset(first_output)),
            )
            for filename in OUTPUT_FILENAMES:
                self.assertEqual((first_output / filename).read_bytes(), (second_output / filename).read_bytes())

    def test_rejects_non_official_source_url(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            source = root / "source"
            shutil.copytree(PUBLIC_FIXTURE, source)
            manifest = read_json(source / "manifest.json")
            manifest["sources"][0]["url"] = "https://example.invalid/private-data"
            write_json(source / "manifest.json", manifest)

            with self.assertRaisesRegex(ValueError, "official public FPL"):
                package_public_fpl_snapshot(
                    source,
                    source / HISTORY_FILENAME,
                    root / "output",
                )

    def test_rejects_incomplete_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            source = root / "source"
            shutil.copytree(PUBLIC_FIXTURE, source)
            (source / "fixtures.json").unlink()

            with self.assertRaisesRegex(FileNotFoundError, "Missing ingestion file"):
                package_public_fpl_snapshot(
                    source,
                    source / HISTORY_FILENAME,
                    root / "output",
                )


def read_json(file_path: Path):
    return json.loads(file_path.read_text(encoding="utf-8"))


def write_json(file_path: Path, value) -> None:
    file_path.write_text(
        f"{json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)}\n",
        encoding="utf-8",
    )


def sha256_file(file_path: Path) -> str:
    return hashlib.sha256(file_path.read_bytes()).hexdigest()


if __name__ == "__main__":
    unittest.main()
