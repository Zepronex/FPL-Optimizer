from __future__ import annotations

import argparse
import itertools
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from pipelines.databricks.cli import resolve_repo_path
from pipelines.databricks.transforms import (
    Dataset,
    JsonObject,
    build_gold_tables,
    build_silver_tables,
    read_ingestion_dataset
)
from pipelines.expected_points.io import write_jsonl

INGESTION_FILES = {'manifest.json', 'players.json', 'teams.json', 'events.json', 'fixtures.json'}

PREDICTION_FEATURE_COLUMNS: tuple[str, ...] = (
    'player_id',
    'player_name',
    'position',
    'team_id',
    'team_name',
    'price',
    'availability_status',
    'chance_of_playing_next_round',
    'chance_of_playing_this_round',
    'total_points',
    'form',
    'recent_points_average',
    'selected_by_percent',
    'minutes',
    'completed_gameweeks',
    'season_points_average',
    'season_minutes_average',
    'rolling_points_average',
    'rolling_minutes_average',
    'points_per_game',
    'value_season',
    'fixture_id',
    'opponent_team_id',
    'opponent_team',
    'fixture_difficulty',
    'upcoming_gameweek_id',
    'home_away',
    'source_snapshot_hash',
    'source_generated_at',
    'season'
)

TRAINING_TARGET_COLUMNS: tuple[str, ...] = ('target_points', 'target_minutes')
TRAINING_FEATURE_COLUMNS: tuple[str, ...] = PREDICTION_FEATURE_COLUMNS + TRAINING_TARGET_COLUMNS


@dataclass(frozen=True)
class SnapshotFeatureBatch:
    snapshot_dir: Path
    generated_at: str
    latest_checked_gameweek_id: int | None
    rows: list[JsonObject]
    players_by_id: dict[int, JsonObject]


def build_prediction_feature_rows(dataset: Dataset) -> list[JsonObject]:
    silver_tables = build_silver_tables(dataset)
    gold_tables = build_gold_tables(silver_tables)
    return [
        normalize_prediction_feature_row(row)
        for row in gold_tables['player_gameweek_features']
    ]


def build_historical_training_rows(snapshot_dirs: Sequence[str | Path], rolling_window: int = 3) -> list[JsonObject]:
    batches = [
        build_snapshot_feature_batch(Path(snapshot_dir))
        for snapshot_dir in snapshot_dirs
    ]
    batches.sort(key=lambda batch: (batch.generated_at, str(batch.snapshot_dir)))

    rows: list[JsonObject] = []
    for batch_index, batch in enumerate(batches):
        future_batches = batches[batch_index + 1:]
        for row in batch.rows:
            target_gameweek_id = int(row['upcoming_gameweek_id'])
            target_batch = find_checked_target_batch(future_batches, target_gameweek_id)
            if target_batch is None:
                continue

            future_player = target_batch.players_by_id.get(int(row['player_id']))
            if future_player is None:
                continue

            target_minutes = int(future_player['minutes']) - int(row['minutes'])
            if target_minutes < 0:
                continue

            training_row = {
                **row,
                'target_points': int(future_player['totalPoints']) - int(row['total_points']),
                'target_minutes': target_minutes
            }
            validate_training_feature_row(training_row)
            rows.append(training_row)

    return add_leakage_safe_rolling_features(rows, rolling_window=rolling_window)


def build_snapshot_feature_batch(snapshot_dir: Path) -> SnapshotFeatureBatch:
    dataset = read_ingestion_dataset(snapshot_dir)
    manifest = dataset['manifest']
    generated_at = str(manifest['generatedAt'])
    players = [
        player
        for player in dataset['players']
        if isinstance(player, dict)
    ]
    return SnapshotFeatureBatch(
        snapshot_dir=snapshot_dir,
        generated_at=generated_at,
        latest_checked_gameweek_id=latest_checked_gameweek_id(dataset),
        rows=build_prediction_feature_rows(dataset),
        players_by_id={int(player['id']): player for player in players}
    )


def latest_checked_gameweek_id(dataset: Dataset) -> int | None:
    checked_ids = [
        int(event['id'])
        for event in dataset['events']
        if isinstance(event, dict) and event.get('finished') and event.get('dataChecked')
    ]
    return max(checked_ids) if checked_ids else None


def find_checked_target_batch(
    future_batches: Sequence[SnapshotFeatureBatch],
    target_gameweek_id: int
) -> SnapshotFeatureBatch | None:
    for batch in future_batches:
        checked_gameweek_id = batch.latest_checked_gameweek_id
        if checked_gameweek_id is None or checked_gameweek_id < target_gameweek_id:
            continue
        if checked_gameweek_id == target_gameweek_id:
            return batch
        return None
    return None


def add_leakage_safe_rolling_features(rows: list[JsonObject], rolling_window: int = 3) -> list[JsonObject]:
    sorted_rows = sorted(rows, key=lambda row: (int(row['player_id']), int(row['upcoming_gameweek_id']), int(row['fixture_id'])))
    output: list[JsonObject] = []

    for player_id, player_rows_iter in itertools.groupby(sorted_rows, key=lambda row: int(row['player_id'])):
        del player_id
        prior_points: list[float] = []
        prior_minutes: list[float] = []
        player_rows = list(player_rows_iter)
        grouped_by_gameweek = itertools.groupby(player_rows, key=lambda row: int(row['upcoming_gameweek_id']))

        for _, gameweek_rows_iter in grouped_by_gameweek:
            gameweek_rows = list(gameweek_rows_iter)
            if prior_points:
                points_average = mean(prior_points[-rolling_window:])
                minutes_average = mean(prior_minutes[-rolling_window:])
            else:
                points_average = float(gameweek_rows[0]['recent_points_average'])
                minutes_average = float(gameweek_rows[0]['season_minutes_average'])

            for row in gameweek_rows:
                enriched = {
                    **row,
                    'rolling_points_average': round(points_average, 4),
                    'rolling_minutes_average': round(minutes_average, 4)
                }
                validate_training_feature_row(enriched)
                output.append(enriched)

            prior_points.append(float(gameweek_rows[0]['target_points']))
            prior_minutes.append(float(gameweek_rows[0]['target_minutes']))

    return sorted(output, key=lambda row: (int(row['upcoming_gameweek_id']), int(row['player_id']), int(row['fixture_id'])))


def normalize_prediction_feature_row(row: JsonObject) -> JsonObject:
    normalized = {
        'player_id': int(row['player_id']),
        'player_name': str(row['player_name']),
        'position': require_position(row['position']),
        'team_id': int(row['team_id']),
        'team_name': str(row.get('team_name') or row.get('team')),
        'price': to_float(row['price']),
        'availability_status': str(row['availability_status']),
        'chance_of_playing_next_round': to_optional_int(row.get('chance_of_playing_next_round')),
        'chance_of_playing_this_round': to_optional_int(row.get('chance_of_playing_this_round')),
        'total_points': int(row['total_points']),
        'form': to_float(row['form']),
        'recent_points_average': to_float(row.get('recent_points_average', row['form'])),
        'selected_by_percent': to_float(row['selected_by_percent']),
        'minutes': int(row['minutes']),
        'completed_gameweeks': int(row.get('completed_gameweeks', 0)),
        'season_points_average': to_float(row.get('season_points_average', row.get('points_per_game', 0))),
        'season_minutes_average': to_float(row.get('season_minutes_average', 0)),
        'rolling_points_average': to_float(row.get('rolling_points_average', row.get('recent_points_average', row['form']))),
        'rolling_minutes_average': to_float(row.get('rolling_minutes_average', row.get('season_minutes_average', 0))),
        'points_per_game': to_float(row['points_per_game']),
        'value_season': to_float(row['value_season']),
        'fixture_id': int(row['fixture_id']),
        'opponent_team_id': int(row['opponent_team_id']),
        'opponent_team': str(row['opponent_team']),
        'fixture_difficulty': int(row['fixture_difficulty']),
        'upcoming_gameweek_id': int(row['upcoming_gameweek_id']),
        'home_away': require_home_away(row['home_away']),
        'source_snapshot_hash': str(row['source_snapshot_hash']),
        'source_generated_at': str(row['source_generated_at']),
        'season': row.get('season')
    }
    validate_prediction_feature_row(normalized)
    return {column: normalized[column] for column in PREDICTION_FEATURE_COLUMNS}


def validate_prediction_feature_row(row: JsonObject) -> None:
    missing = [column for column in PREDICTION_FEATURE_COLUMNS if column not in row]
    if missing:
        raise ValueError(f'Feature row is missing required columns: {missing}')
    if row['position'] not in {'GK', 'DEF', 'MID', 'FWD'}:
        raise ValueError(f'Invalid position: {row["position"]}')
    if row['home_away'] not in {'H', 'A'}:
        raise ValueError(f'Invalid home_away: {row["home_away"]}')
    if int(row['upcoming_gameweek_id']) <= 0:
        raise ValueError('upcoming_gameweek_id must be positive')
    if 'target_points' in row:
        raise ValueError('Prediction feature rows must not include target_points')


def validate_training_feature_row(row: JsonObject) -> None:
    missing = [column for column in TRAINING_FEATURE_COLUMNS if column not in row]
    if missing:
        raise ValueError(f'Training row is missing required columns: {missing}')
    prediction_part = {column: row[column] for column in PREDICTION_FEATURE_COLUMNS}
    validate_prediction_feature_row(prediction_part)
    if not isinstance(row['target_points'], (int, float)):
        raise ValueError('target_points must be numeric')
    if not isinstance(row['target_minutes'], (int, float)) or row['target_minutes'] < 0:
        raise ValueError('target_minutes must be a nonnegative number')


def discover_snapshot_dirs(root_dir: str | Path) -> list[Path]:
    root = Path(root_dir)
    if is_ingestion_snapshot_dir(root):
        return [root]

    snapshot_dirs = [
        manifest_path.parent
        for manifest_path in root.rglob('manifest.json')
        if is_ingestion_snapshot_dir(manifest_path.parent)
    ]
    return sorted(set(snapshot_dirs), key=lambda path: str(path))


def is_ingestion_snapshot_dir(path: Path) -> bool:
    return all((path / file_name).exists() for file_name in INGESTION_FILES)


def require_position(value: Any) -> str:
    position = str(value)
    if position not in {'GK', 'DEF', 'MID', 'FWD'}:
        raise ValueError(f'Invalid position: {position}')
    return position


def require_home_away(value: Any) -> str:
    home_away = str(value)
    if home_away not in {'H', 'A'}:
        raise ValueError(f'Invalid home_away: {home_away}')
    return home_away


def to_float(value: Any) -> float:
    parsed = float(value)
    if parsed != parsed:
        raise ValueError('NaN is not a valid feature value')
    return parsed


def to_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def mean(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    input_path = resolve_repo_path(args.input)
    output_path = resolve_repo_path(
        args.output
        or ('data/features/player_gameweek_training_rows.jsonl' if args.historical else 'data/features/player_gameweek_features.jsonl')
    )

    if args.historical:
        snapshot_dirs = discover_snapshot_dirs(input_path)
        rows = build_historical_training_rows(snapshot_dirs, rolling_window=args.rolling_window)
        print(f'Wrote {len(rows)} historical expected-points training rows from {len(snapshot_dirs)} snapshots to {output_path}')
    else:
        rows = build_prediction_feature_rows(read_ingestion_dataset(input_path))
        print(f'Wrote {len(rows)} current expected-points feature rows to {output_path}')

    write_jsonl(output_path, rows)
    return 0


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Build ScoutIQ expected-points feature rows.')
    parser.add_argument(
        '--input',
        default='data/fpl/latest',
        help='Normalized FPL snapshot directory, or a root containing multiple snapshots when --historical is set.'
    )
    parser.add_argument(
        '--output',
        default=None,
        help='Output JSONL path. Defaults under data/features/.'
    )
    parser.add_argument(
        '--historical',
        action='store_true',
        help='Build target-bearing training rows by pairing pre-gameweek snapshots with checked post-gameweek snapshots.'
    )
    parser.add_argument(
        '--rolling-window',
        type=int,
        default=3,
        help='Number of prior player gameweeks used for rolling averages in historical rows.'
    )
    return parser.parse_args(argv)


if __name__ == '__main__':
    raise SystemExit(main())
