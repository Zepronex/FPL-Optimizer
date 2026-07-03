from __future__ import annotations

import argparse
from typing import Sequence

from pipelines.databricks.cli import resolve_repo_path
from pipelines.expected_points.baseline import RuleBasedExpectedPointsModel
from pipelines.expected_points.features import validate_training_feature_row
from pipelines.expected_points.io import read_jsonl, write_json


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    input_path = resolve_repo_path(args.input)
    output_path = resolve_repo_path(args.output)

    rows = read_jsonl(input_path)
    for row in rows:
        validate_training_feature_row(row)

    gameweek_count = len({int(row['upcoming_gameweek_id']) for row in rows})
    if gameweek_count < args.min_gameweeks:
        raise ValueError(
            f'Expected at least {args.min_gameweeks} historical gameweeks, received {gameweek_count}'
        )

    model = RuleBasedExpectedPointsModel.fit(rows)
    write_json(output_path, model.to_dict())
    print(f'Trained {model.model_version} on {model.training_row_count} rows and wrote {output_path}')
    return 0


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Train the ScoutIQ expected-points baseline.')
    parser.add_argument(
        '--input',
        default='data/features/player_gameweek_training_rows.jsonl',
        help='Historical target-bearing feature rows built by pipeline:features -- --historical.'
    )
    parser.add_argument(
        '--output',
        default='data/models/expected_points_baseline.json',
        help='Local model artifact JSON path.'
    )
    parser.add_argument(
        '--min-gameweeks',
        type=int,
        default=2,
        help='Minimum number of historical target gameweeks required for training.'
    )
    return parser.parse_args(argv)


if __name__ == '__main__':
    raise SystemExit(main())
