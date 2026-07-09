from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from pipelines.databricks.cli import resolve_repo_path
from pipelines.expected_points.baseline import RuleBasedExpectedPointsModel
from pipelines.expected_points.features import normalize_prediction_feature_row
from pipelines.expected_points.io import read_json, read_jsonl, write_jsonl


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    feature_path = resolve_feature_path(args.features)
    model_path = resolve_repo_path(args.model)
    output_path = resolve_repo_path(args.output)

    rows = [
        normalize_prediction_feature_row(row)
        for row in read_jsonl(feature_path)
    ]

    if model_path.exists():
        model = RuleBasedExpectedPointsModel.from_dict(read_json(model_path))
    elif args.require_trained:
        raise FileNotFoundError(f'Missing model artifact: {model_path}')
    else:
        model = RuleBasedExpectedPointsModel()
        print(f'Model artifact not found at {model_path}; using uncalibrated rule baseline')

    predictions = sorted(
        model.predict(rows),
        key=lambda row: (-float(row['expected_points']), str(row['position']), str(row['player_name']))
    )
    write_jsonl(output_path, predictions)
    print(f'Wrote {len(predictions)} expected-points predictions to {output_path}')
    return 0


def resolve_feature_path(value: str) -> Path:
    preferred_path = resolve_repo_path(value)
    if preferred_path.exists():
        return preferred_path

    gold_path = resolve_repo_path('data/lakehouse/gold/player_gameweek_features/part-00000.jsonl')
    if value == 'data/features/player_gameweek_features.jsonl' and gold_path.exists():
        return gold_path

    return preferred_path


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Predict expected points from current Gold feature rows.')
    parser.add_argument(
        '--features',
        default='data/features/player_gameweek_features.jsonl',
        help='Current prediction feature JSONL path. Falls back to local Gold output when using the default.'
    )
    parser.add_argument(
        '--model',
        default='data/models/expected_points_baseline.json',
        help='Local trained model artifact JSON path.'
    )
    parser.add_argument(
        '--output',
        default='data/predictions/expected_points_latest.jsonl',
        help='Local prediction JSONL output path.'
    )
    parser.add_argument(
        '--require-trained',
        action='store_true',
        help='Fail if the trained baseline artifact is missing.'
    )
    return parser.parse_args(argv)


if __name__ == '__main__':
    raise SystemExit(main())
