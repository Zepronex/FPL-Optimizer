from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name('generate_resume_metrics.py')
SPEC = importlib.util.spec_from_file_location('generate_resume_metrics', SCRIPT_PATH)
assert SPEC and SPEC.loader
METRICS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(METRICS)


class ResumeMetricsTests(unittest.TestCase):
    def test_generates_counts_and_metrics_from_canonical_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            snapshot = root / 'data/fpl/latest'
            snapshot.mkdir(parents=True)
            (snapshot / 'manifest.json').write_text(json.dumps({
                'season': '2025-26',
                'snapshotHash': 'snapshot-123',
                'recordCounts': {'players': 2, 'teams': 2, 'events': 1, 'fixtures': 1}
            }), encoding='utf-8')
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

        self.assertEqual(result['snapshot']['players'], 2)
        self.assertEqual(result['snapshot']['gameweeks'], 1)
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
