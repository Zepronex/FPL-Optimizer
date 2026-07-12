#!/usr/bin/env python3
"""Generate provenance-bearing, résumé-safe metrics from local ScoutIQ artifacts.

This script deliberately reports null values when the canonical artifact is absent.
It never substitutes fixture values, test fixtures, README prose, or a live API response.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    value = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(value, dict):
        raise ValueError(f'Expected a JSON object in {path}')
    return value


def count_jsonl_rows(path: Path) -> int | None:
    if not path.exists():
        return None
    return sum(1 for line in path.read_text(encoding='utf-8').splitlines() if line.strip())


def file_provenance(path: Path) -> dict[str, str] | None:
    if not path.exists():
        return None
    return {
        'path': str(path),
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest()
    }


def generate_metrics(root: Path) -> dict[str, Any]:
    snapshot_dir = root / 'data' / 'fpl' / 'latest'
    manifest_path = snapshot_dir / 'manifest.json'
    databricks_snapshot_dir = root / 'data' / 'databricks' / 'public_fpl_snapshot'
    snapshot_metadata_path = databricks_snapshot_dir / 'snapshot_metadata.json'
    history_path = databricks_snapshot_dir / 'player_gameweek_history.json'
    training_rows_path = root / 'data' / 'features' / 'player_gameweek_training_rows.jsonl'
    backtest_path = root / 'data' / 'evaluation' / 'expected_points_backtest.json'
    manifest = read_json(manifest_path)
    snapshot_metadata = read_json(snapshot_metadata_path)
    backtest = read_json(backtest_path)

    if snapshot_metadata and snapshot_metadata.get('isTestFixture'):
        snapshot_metadata = None

    snapshot_counts = (
        snapshot_metadata.get('recordCounts')
        if snapshot_metadata
        else manifest.get('recordCounts') if manifest else None
    )
    if snapshot_counts is not None and not isinstance(snapshot_counts, dict):
        raise ValueError(f'Expected manifest.recordCounts to be an object in {manifest_path}')

    metrics: dict[str, Any] = {
        'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'method': 'local_artifacts_only',
        'snapshot': {
            'season': (
                snapshot_metadata.get('effectiveSeason')
                if snapshot_metadata
                else manifest.get('season') if manifest else None
            ),
            'snapshot_hash': (
                snapshot_metadata.get('sourceSnapshotHash')
                if snapshot_metadata
                else manifest.get('snapshotHash') if manifest else None
            ),
            'players': snapshot_counts.get('players') if snapshot_counts else None,
            'teams': snapshot_counts.get('teams') if snapshot_counts else None,
            'gameweeks': snapshot_counts.get('events') if snapshot_counts else None,
            'fixtures': snapshot_counts.get('fixtures') if snapshot_counts else None,
            'history_rows': snapshot_counts.get('historyRows') if snapshot_counts else None,
            'provenance': file_provenance(manifest_path),
            'snapshot_metadata_provenance': file_provenance(snapshot_metadata_path),
            'history_provenance': file_provenance(history_path)
        },
        'training': {
            'player_gameweek_rows': count_jsonl_rows(training_rows_path),
            'provenance': file_provenance(training_rows_path)
        },
        'backtest': {
            'evaluated_rows': backtest.get('prediction_count') if backtest else None,
            'mae': nested_value(backtest, 'metrics', 'mae'),
            'rmse': nested_value(backtest, 'metrics', 'rmse'),
            'baseline_mae': nested_value(backtest, 'baseline_metrics', 'mae'),
            'baseline_rmse': nested_value(backtest, 'baseline_metrics', 'rmse'),
            'provenance': file_provenance(backtest_path)
        }
    }
    metrics['warnings'] = missing_artifact_warnings(metrics)
    return metrics


def nested_value(value: dict[str, Any] | None, key: str, nested_key: str) -> Any:
    nested = value.get(key) if value else None
    return nested.get(nested_key) if isinstance(nested, dict) else None


def missing_artifact_warnings(metrics: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    for section, label in (('snapshot', 'normalized FPL snapshot'), ('training', 'training rows'), ('backtest', 'backtest report')):
        if metrics[section]['provenance'] is None:
            warnings.append(f'{label} is absent; its metrics are intentionally null.')
    return warnings


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Generate résumé-safe ScoutIQ metrics from local artifacts.')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, default=Path('artifacts/resume_metrics.json'))
    args = parser.parse_args(argv)
    root = args.root.resolve()
    output = args.output if args.output.is_absolute() else root / args.output
    metrics = generate_metrics(root)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(metrics, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(f'Wrote résumé-safe metrics to {output}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
