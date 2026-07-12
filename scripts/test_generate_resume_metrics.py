from __future__ import annotations

import importlib.util
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name('generate_resume_metrics.py')
SPEC = importlib.util.spec_from_file_location('generate_resume_metrics', SCRIPT_PATH)
assert SPEC and SPEC.loader
METRICS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(METRICS)


def write_packaged_snapshot(root: Path) -> Path:
    snapshot = root / 'data/databricks/public_fpl_snapshot'
    snapshot.mkdir(parents=True)
    values = {
        'manifest.json': {
            'recordCounts': {'players': 2, 'teams': 2, 'events': 1, 'fixtures': 1}
        },
        'players.json': [{'id': 1}, {'id': 2}],
        'teams.json': [{'id': 1}, {'id': 2}],
        'events.json': [{'id': 1}],
        'fixtures.json': [{'id': 1}],
        'player_gameweek_history.json': {'rowCount': 2, 'rows': [{'id': 1}, {'id': 2}]}
    }
    for filename, value in values.items():
        (snapshot / filename).write_text(json.dumps(value), encoding='utf-8')
    file_hashes = {
        filename: hashlib.sha256((snapshot / filename).read_bytes()).hexdigest()
        for filename in METRICS.PACKAGED_FILENAMES
    }
    metadata = {
        'isTestFixture': False,
        'effectiveSeason': '2025-26',
        'hashAlgorithm': 'SHA-256',
        'sourceSnapshotHash': 'a' * 64,
        'canonicalSnapshotHash': 'a' * 64,
        'historyCaptureHash': file_hashes['player_gameweek_history.json'],
        'fileSha256': file_hashes,
        'recordCounts': {'players': 2, 'teams': 2, 'events': 1, 'fixtures': 1, 'historyRows': 2}
    }
    (snapshot / 'snapshot_metadata.json').write_text(json.dumps(metadata), encoding='utf-8')
    return snapshot


class ResumeMetricsTests(unittest.TestCase):
    def test_generates_counts_and_metrics_from_canonical_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            snapshot = root / 'data/fpl/latest'
            snapshot.mkdir(parents=True)
            (snapshot / 'manifest.json').write_text(json.dumps({
                'season': '2025-26',
                'recordCounts': {'players': 2, 'teams': 2, 'events': 1, 'fixtures': 1}
            }), encoding='utf-8')
            databricks_snapshot = write_packaged_snapshot(root)
            training = root / 'data/features'
            training.mkdir(parents=True)
            (training / 'player_gameweek_training_rows.jsonl').write_text('{"player_id": 1}\n{"player_id": 2}\n')
            evaluation = root / 'data/evaluation'
            evaluation.mkdir(parents=True)
            (evaluation / 'expected_points_backtest.json').write_text(json.dumps({
                'prediction_count': 2,
                'metrics': {'mae': 1.1, 'rmse': 2.2},
                'baseline_metrics': {'mae': 1.0, 'rmse': 2.0}
            }))

            result = METRICS.generate_metrics(root)

            serialized = json.dumps(result)
            self.assertNotIn(str(root), serialized)
            self.assertEqual(
                result['snapshot']['provenance']['path'],
                'data/fpl/latest/manifest.json'
            )
            self.assertEqual(
                result['snapshot']['provenance']['sha256'],
                hashlib.sha256((snapshot / 'manifest.json').read_bytes()).hexdigest()
            )

        self.assertEqual(result['snapshot']['players'], 2)
        self.assertEqual(result['snapshot']['gameweeks'], 1)
        self.assertEqual(result['snapshot']['snapshot_hash'], 'a' * 64)
        self.assertEqual(result['snapshot']['history_rows'], 2)
        self.assertEqual(result['training']['player_gameweek_rows'], 2)
        self.assertEqual(result['backtest']['evaluated_rows'], 2)
        self.assertEqual(result['backtest']['baseline_rmse'], 2.0)
        self.assertEqual(result['warnings'], [])

    def test_marks_missing_artifacts_without_inventing_metrics(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            result = METRICS.generate_metrics(Path(temp_dir))

        self.assertIsNone(result['snapshot']['players'])
        self.assertIsNone(result['training']['player_gameweek_rows'])
        self.assertIsNone(result['backtest']['evaluated_rows'])
        self.assertEqual(len(result['warnings']), 3)

    def test_rejects_oversized_or_symlinked_metric_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            training = root / 'data/features'
            training.mkdir(parents=True)
            with (training / 'player_gameweek_training_rows.jsonl').open('wb') as output:
                output.truncate(METRICS.MAX_ARTIFACT_BYTES + 1)
            with self.assertRaisesRegex(ValueError, 'aggregate byte limit'):
                METRICS.generate_metrics(root)

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            snapshot = root / 'data/fpl/latest'
            snapshot.mkdir(parents=True)
            target = root / 'target.json'
            target.write_text('{}', encoding='utf-8')
            os.symlink(target, snapshot / 'manifest.json')
            with self.assertRaisesRegex(ValueError, 'regular non-symlink file: manifest.json'):
                METRICS.generate_metrics(root)

    def test_rejects_nonstandard_json_and_malformed_jsonl(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            snapshot = root / 'data/fpl/latest'
            snapshot.mkdir(parents=True)
            (snapshot / 'manifest.json').write_text('{"season": NaN}', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'Invalid strict JSON artifact: manifest.json') as error:
                METRICS.generate_metrics(root)
            self.assertNotIn(str(root), str(error.exception))

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            training = root / 'data/features'
            training.mkdir(parents=True)
            (training / 'player_gameweek_training_rows.jsonl').write_bytes(b'{"player_id":\xff}\n')
            with self.assertRaisesRegex(ValueError, 'Invalid strict JSON'):
                METRICS.generate_metrics(root)

    def test_rejects_tampered_snapshot_provenance_and_count_mismatches(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            snapshot = write_packaged_snapshot(root)
            history = snapshot / 'player_gameweek_history.json'
            history.write_bytes(history.read_bytes() + b'\n')
            with self.assertRaisesRegex(ValueError, 'hash does not match metadata'):
                METRICS.generate_metrics(root)

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            snapshot = write_packaged_snapshot(root)
            metadata_path = snapshot / 'snapshot_metadata.json'
            metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
            metadata['recordCounts']['historyRows'] = 3
            metadata_path.write_text(json.dumps(metadata), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'row count does not match'):
                METRICS.generate_metrics(root)

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            snapshot = write_packaged_snapshot(root)
            metadata_path = snapshot / 'snapshot_metadata.json'
            metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
            metadata['sourceSnapshotHash'] = 'not-a-hash'
            metadata_path.write_text(json.dumps(metadata), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'SHA-256 hexadecimal digest'):
                METRICS.generate_metrics(root)

    def test_rejects_invalid_numeric_resume_claims(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            snapshot = root / 'data/fpl/latest'
            snapshot.mkdir(parents=True)
            manifest_path = snapshot / 'manifest.json'
            manifest = {
                'season': '2025-26',
                'snapshotHash': 'invalid',
                'recordCounts': {'players': 2, 'teams': 2, 'events': 1, 'fixtures': 1}
            }
            manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'SHA-256 hexadecimal digest'):
                METRICS.generate_metrics(root)

            manifest.pop('snapshotHash')
            manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
            evaluation = root / 'data/evaluation'
            evaluation.mkdir(parents=True)
            (evaluation / 'expected_points_backtest.json').write_text(json.dumps({
                'prediction_count': 2,
                'metrics': {'mae': -1, 'rmse': 2},
                'baseline_metrics': {'mae': 1, 'rmse': 2}
            }), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'finite nonnegative number'):
                METRICS.generate_metrics(root)
