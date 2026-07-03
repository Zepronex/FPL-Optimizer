from __future__ import annotations

import argparse
from typing import Sequence

from pipelines.databricks.cli import resolve_repo_path
from pipelines.expected_points.evaluation import walk_forward_backtest
from pipelines.expected_points.io import read_jsonl, write_json, write_jsonl


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    input_path = resolve_repo_path(args.input)
    output_path = resolve_repo_path(args.output)
    predictions_output_path = resolve_repo_path(args.predictions_output)

    rows = read_jsonl(input_path)
    report = walk_forward_backtest(rows, min_training_gameweeks=args.min_training_gameweeks)
    predictions = list(report.pop('predictions'))

    write_json(output_path, report)
    write_jsonl(predictions_output_path, predictions)

    metrics = report['metrics']
    baseline_metrics = report['baseline_metrics']
    print(
        'Backtest complete: '
        f"rows={report['prediction_count']} "
        f"mae={metrics['mae']} rmse={metrics['rmse']} "
        f"baseline_mae={baseline_metrics['mae']} baseline_rmse={baseline_metrics['rmse']}"
    )
    print(f'Wrote evaluation report to {output_path}')
    print(f'Wrote backtest predictions to {predictions_output_path}')
    return 0


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Backtest the ScoutIQ expected-points baseline.')
    parser.add_argument(
        '--input',
        default='data/features/player_gameweek_training_rows.jsonl',
        help='Historical target-bearing feature rows built by pipeline:features -- --historical.'
    )
    parser.add_argument(
        '--output',
        default='data/evaluation/expected_points_backtest.json',
        help='Local evaluation report JSON path.'
    )
    parser.add_argument(
        '--predictions-output',
        default='data/evaluation/expected_points_backtest_predictions.jsonl',
        help='Local backtest prediction JSONL path.'
    )
    parser.add_argument(
        '--min-training-gameweeks',
        type=int,
        default=2,
        help='Minimum prior gameweeks required before evaluating a target gameweek.'
    )
    return parser.parse_args(argv)


if __name__ == '__main__':
    raise SystemExit(main())
