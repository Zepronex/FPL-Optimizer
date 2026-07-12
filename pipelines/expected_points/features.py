from __future__ import annotations

import argparse
import itertools
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from pipelines.databricks.cli import resolve_repo_path
from pipelines.databricks.transforms import (
    Dataset,
    JsonObject,
    build_gold_tables,
    build_silver_tables,
    dataset_snapshot_hash,
    read_ingestion_dataset
)
from pipelines.expected_points.io import read_bounded_json, write_jsonl

INGESTION_FILES = {'manifest.json', 'players.json', 'teams.json', 'events.json', 'fixtures.json'}
DEFAULT_FEATURE_OUTPUT = 'data/features/player_gameweek_features.jsonl'
DEFAULT_TRAINING_OUTPUT = 'data/features/player_gameweek_training_rows.jsonl'
DEFAULT_HISTORY_INPUT = 'data/fpl/history/player_gameweek_history.json'
MAX_HISTORY_JSON_BYTES = 16 * 1024 * 1024
MAX_HISTORY_ROWS = 400_000
MAX_POSTGRES_INTEGER = 2_147_483_647
HISTORY_TOP_LEVEL_KEYS = {
    'schemaVersion',
    'generatedAt',
    'source',
    'inputSnapshotGeneratedAt',
    'inputSeason',
    'playerCount',
    'rowCount',
    'rows'
}
HISTORY_SOURCE_KEYS = {'name', 'urlTemplate', 'fetchedAt'}
HISTORY_ROW_KEYS = {
    'playerId',
    'fixtureId',
    'gameweekId',
    'opponentTeamId',
    'wasHome',
    'kickoffTime',
    'totalPoints',
    'minutes',
    'price',
    'selected'
}

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
FINITE_NUMERIC_FEATURE_COLUMNS: tuple[str, ...] = (
    'player_id',
    'team_id',
    'price',
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
    'fixture_difficulty',
    'upcoming_gameweek_id',
)
OPTIONAL_FINITE_NUMERIC_FEATURE_COLUMNS: tuple[str, ...] = (
    'chance_of_playing_next_round',
    'chance_of_playing_this_round',
)
INTEGER_FEATURE_COLUMNS: tuple[str, ...] = (
    'player_id',
    'team_id',
    'total_points',
    'minutes',
    'completed_gameweeks',
    'fixture_id',
    'opponent_team_id',
    'fixture_difficulty',
    'upcoming_gameweek_id',
)


@dataclass(frozen=True)
class SnapshotFeatureBatch:
    snapshot_dir: Path
    generated_at: str
    latest_checked_gameweek_id: int | None
    rows: list[JsonObject]
    players_by_id: dict[int, JsonObject]


@dataclass(frozen=True)
class FeatureBuildResult:
    prediction_rows: list[JsonObject]
    training_rows: list[JsonObject]
    prediction_source: str
    messages: list[str]


def build_prediction_feature_rows(dataset: Dataset) -> list[JsonObject]:
    silver_tables = build_silver_tables(dataset)
    gold_tables = build_gold_tables(silver_tables)
    return [
        normalize_prediction_feature_row(row)
        for row in gold_tables['player_gameweek_features']
    ]


def build_expected_points_feature_files(
    input_dir: str | Path,
    history_path: str | Path,
    *,
    rolling_window: int = 3
) -> FeatureBuildResult:
    dataset = read_ingestion_dataset(input_dir)
    prediction_rows = build_prediction_feature_rows(dataset)
    prediction_source = 'current-upcoming-fixtures'
    messages: list[str] = []

    if prediction_rows:
        messages.append(f'Prepared {len(prediction_rows)} current upcoming-gameweek prediction feature rows.')
    else:
        messages.append(
            'No current upcoming-gameweek feature rows were produced from the latest snapshot. '
            'This usually means the snapshot has no unstarted future fixtures.'
        )

    resolved_history_path = Path(history_path)
    if resolved_history_path.exists():
        history_payload = read_player_history_payload(resolved_history_path)
        training_rows = build_training_rows_from_player_history(
            dataset,
            history_payload,
            rolling_window=rolling_window
        )
        messages.append(f'Prepared {len(training_rows)} historical training rows from {resolved_history_path}.')

        if not prediction_rows and training_rows:
            latest_gameweek_id = max(int(row['upcoming_gameweek_id']) for row in training_rows)
            prediction_rows = [
                strip_training_targets(row)
                for row in training_rows
                if int(row['upcoming_gameweek_id']) == latest_gameweek_id
            ]
            prediction_source = 'latest-historical-gameweek'
            messages.append(
                f'Wrote {len(prediction_rows)} latest historical gameweek feature rows for local prediction validation '
                f'because no upcoming fixtures are available in the latest snapshot.'
            )
    else:
        training_rows = []
        messages.append(
            f'No historical player-gameweek file found at {resolved_history_path}. '
            'Run pnpm.cmd run ingest:fpl:history before training or backtesting.'
        )

    return FeatureBuildResult(
        prediction_rows=prediction_rows,
        training_rows=training_rows,
        prediction_source=prediction_source,
        messages=messages
    )


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


def build_training_rows_from_player_history(
    dataset: Dataset,
    history_payload: JsonObject,
    *,
    rolling_window: int = 3
) -> list[JsonObject]:
    players = sorted(
        [player for player in dataset['players'] if isinstance(player, dict)],
        key=lambda player: int(player['id'])
    )
    teams_by_id = {
        int(team['id']): team
        for team in dataset['teams']
        if isinstance(team, dict)
    }
    fixtures_by_id = {
        int(fixture['id']): fixture
        for fixture in dataset['fixtures']
        if isinstance(fixture, dict)
    }
    history_by_player_id = normalize_history_rows_by_player(history_payload)
    validate_history_dataset_lineage(
        dataset,
        history_payload,
        history_by_player_id,
        players,
        teams_by_id,
        fixtures_by_id
    )
    source_snapshot_hash = dataset_snapshot_hash(dataset)
    source_generated_at = str(dataset['manifest']['generatedAt'])
    season = dataset['manifest'].get('season')

    rows: list[JsonObject] = []
    for player in players:
        player_id = int(player['id'])
        player_history = sorted(
            history_by_player_id.get(player_id, []),
            key=lambda row: (int(row['gameweekId']), int(row['fixtureId']))
        )
        prior_points: list[float] = []
        prior_minutes: list[float] = []
        cumulative_points = 0
        cumulative_minutes = 0
        last_known_price = float(player['nowCost'])

        for history_row in player_history:
            fixture = fixtures_by_id[int(history_row['fixtureId'])]
            gameweek_id = int(history_row['gameweekId'])
            own_team_id = resolve_fixture_team_id(fixture, history_row)
            team = teams_by_id[own_team_id]
            opponent_team = teams_by_id[int(history_row['opponentTeamId'])]

            rolling_points_average = mean(prior_points[-rolling_window:]) if prior_points else 0.0
            rolling_minutes_average = mean(prior_minutes[-rolling_window:]) if prior_minutes else 0.0
            completed_gameweeks = len(prior_points)
            target_points = int(history_row['totalPoints'])
            target_minutes = int(history_row['minutes'])
            home_away = 'H' if bool(history_row['wasHome']) else 'A'

            row = {
                'player_id': player_id,
                'player_name': str(player['displayName']),
                'position': require_position(player['position']),
                'team_id': own_team_id,
                'team_name': str(team['name']),
                'price': round(last_known_price, 1),
                'availability_status': 'unknown',
                'chance_of_playing_next_round': None,
                'chance_of_playing_this_round': None,
                'total_points': cumulative_points,
                'form': round(rolling_points_average, 4),
                'recent_points_average': round(rolling_points_average, 4),
                'selected_by_percent': 0.0,
                'minutes': cumulative_minutes,
                'completed_gameweeks': completed_gameweeks,
                'season_points_average': round(mean(prior_points), 4) if prior_points else 0.0,
                'season_minutes_average': round(mean(prior_minutes), 4) if prior_minutes else 0.0,
                'rolling_points_average': round(rolling_points_average, 4),
                'rolling_minutes_average': round(rolling_minutes_average, 4),
                'points_per_game': round(mean(prior_points), 4) if prior_points else 0.0,
                'value_season': 0.0,
                'fixture_id': int(history_row['fixtureId']),
                'opponent_team_id': int(history_row['opponentTeamId']),
                'opponent_team': str(opponent_team['name']),
                'fixture_difficulty': fixture_difficulty_for_team(fixture, home_away),
                'upcoming_gameweek_id': gameweek_id,
                'home_away': home_away,
                'source_snapshot_hash': source_snapshot_hash,
                'source_generated_at': source_generated_at,
                'season': season,
                'target_points': target_points,
                'target_minutes': target_minutes
            }
            validate_training_feature_row(row)
            rows.append(row)

            prior_points.append(float(target_points))
            prior_minutes.append(float(target_minutes))
            cumulative_points += target_points
            cumulative_minutes += target_minutes
            last_known_price = float(history_row.get('price', last_known_price))

    return sorted(rows, key=lambda row: (int(row['upcoming_gameweek_id']), int(row['player_id']), int(row['fixture_id'])))


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


def strip_training_targets(row: JsonObject) -> JsonObject:
    prediction_row = {
        column: row[column]
        for column in PREDICTION_FEATURE_COLUMNS
    }
    validate_prediction_feature_row(prediction_row)
    return prediction_row


def read_player_history_payload(file_path: str | Path) -> JsonObject:
    value = read_bounded_json(file_path, MAX_HISTORY_JSON_BYTES, 'player history JSON')
    validate_player_history_payload(value)
    return value


def normalize_history_rows_by_player(history_payload: JsonObject) -> dict[int, list[JsonObject]]:
    raw_rows = validate_player_history_payload(history_payload)

    rows_by_player: dict[int, list[JsonObject]] = {}
    seen_player_fixtures: set[tuple[int, int]] = set()
    for index, raw_row in enumerate(raw_rows):
        row = {
            'playerId': require_bounded_integer(
                raw_row['playerId'], 'history.playerId', 1, MAX_POSTGRES_INTEGER
            ),
            'fixtureId': require_bounded_integer(
                raw_row['fixtureId'], 'history.fixtureId', 1, MAX_POSTGRES_INTEGER
            ),
            'gameweekId': require_bounded_integer(raw_row['gameweekId'], 'history.gameweekId', 1, 38),
            'opponentTeamId': require_bounded_integer(
                raw_row['opponentTeamId'], 'history.opponentTeamId', 1, 100
            ),
            'wasHome': require_boolean(raw_row['wasHome'], 'history.wasHome'),
            'totalPoints': require_bounded_integer(raw_row['totalPoints'], 'history.totalPoints', -20, 100),
            'minutes': require_bounded_integer(raw_row['minutes'], 'history.minutes', 0, 180),
            'price': require_bounded_number(raw_row['price'], 'history.price', 0, 100)
        }
        player_fixture = (row['playerId'], row['fixtureId'])
        if player_fixture in seen_player_fixtures:
            raise ValueError(f'History row {index} duplicates a player and fixture pair')
        seen_player_fixtures.add(player_fixture)
        rows_by_player.setdefault(row['playerId'], []).append(row)

    return rows_by_player


def validate_player_history_payload(history_payload: JsonObject) -> list[JsonObject]:
    require_exact_keys(history_payload, HISTORY_TOP_LEVEL_KEYS, 'Player history payload')
    if require_integer(history_payload['schemaVersion'], 'history.schemaVersion') != 1:
        raise ValueError('history.schemaVersion must equal 1')
    require_bounded_string(history_payload['generatedAt'], 'history.generatedAt', 1, 100)
    require_bounded_string(
        history_payload['inputSnapshotGeneratedAt'], 'history.inputSnapshotGeneratedAt', 1, 100
    )
    input_season = history_payload['inputSeason']
    if input_season is not None:
        require_bounded_string(input_season, 'history.inputSeason', 1, 40)

    source = history_payload['source']
    if not isinstance(source, dict):
        raise ValueError('history.source must be an object')
    require_exact_keys(source, HISTORY_SOURCE_KEYS, 'history.source')
    if source['name'] != 'element-summary':
        raise ValueError('history.source.name must equal element-summary')
    require_bounded_string(source['urlTemplate'], 'history.source.urlTemplate', 1, 2048)
    require_bounded_string(source['fetchedAt'], 'history.source.fetchedAt', 1, 100)

    player_count = require_bounded_integer(history_payload['playerCount'], 'history.playerCount', 0, 2_000)
    row_count = require_bounded_integer(history_payload['rowCount'], 'history.rowCount', 0, MAX_HISTORY_ROWS)
    raw_rows = history_payload['rows']
    if not isinstance(raw_rows, list):
        raise ValueError('Historical player-gameweek file must contain a rows array')
    if len(raw_rows) > MAX_HISTORY_ROWS:
        raise ValueError('Historical player-gameweek file exceeds its row limit')
    if row_count != len(raw_rows):
        raise ValueError('history.rowCount must match the rows array length')
    if player_count == 0 and raw_rows:
        raise ValueError('history.playerCount cannot be zero when rows are present')

    typed_rows: list[JsonObject] = []
    seen_player_fixtures: set[tuple[int, int]] = set()
    for index, raw_row in enumerate(raw_rows):
        if not isinstance(raw_row, dict):
            raise ValueError(f'History row {index} must be an object')
        require_exact_keys(raw_row, HISTORY_ROW_KEYS, f'History row {index}')
        player_id = require_bounded_integer(
            raw_row['playerId'], f'history.rows[{index}].playerId', 1, MAX_POSTGRES_INTEGER
        )
        fixture_id = require_bounded_integer(
            raw_row['fixtureId'], f'history.rows[{index}].fixtureId', 1, MAX_POSTGRES_INTEGER
        )
        require_bounded_integer(raw_row['gameweekId'], f'history.rows[{index}].gameweekId', 1, 38)
        require_bounded_integer(
            raw_row['opponentTeamId'], f'history.rows[{index}].opponentTeamId', 1, 100
        )
        require_boolean(raw_row['wasHome'], f'history.rows[{index}].wasHome')
        kickoff_time = raw_row['kickoffTime']
        if kickoff_time is not None:
            require_bounded_string(kickoff_time, f'history.rows[{index}].kickoffTime', 1, 100)
        require_bounded_integer(raw_row['totalPoints'], f'history.rows[{index}].totalPoints', -20, 100)
        require_bounded_integer(raw_row['minutes'], f'history.rows[{index}].minutes', 0, 180)
        require_bounded_number(raw_row['price'], f'history.rows[{index}].price', 0, 100)
        require_bounded_integer(raw_row['selected'], f'history.rows[{index}].selected', 0, 100_000_000)
        player_fixture = (player_id, fixture_id)
        if player_fixture in seen_player_fixtures:
            raise ValueError(f'History row {index} duplicates a player and fixture pair')
        seen_player_fixtures.add(player_fixture)
        typed_rows.append(raw_row)
    return typed_rows


def validate_history_dataset_lineage(
    dataset: Dataset,
    history_payload: JsonObject,
    history_by_player_id: dict[int, list[JsonObject]],
    players: list[JsonObject],
    teams_by_id: dict[int, JsonObject],
    fixtures_by_id: dict[int, JsonObject]
) -> None:
    manifest = dataset['manifest']
    if history_payload['inputSnapshotGeneratedAt'] != manifest['generatedAt']:
        raise ValueError('Player history input snapshot does not match the normalized dataset')
    if history_payload['inputSeason'] != manifest.get('season'):
        raise ValueError('Player history season does not match the normalized dataset')
    if history_payload['playerCount'] != len(players):
        raise ValueError('Player history player count does not match the normalized dataset')

    player_ids = {int(player['id']) for player in players}
    event_ids = {
        int(event['id'])
        for event in dataset['events']
        if isinstance(event, dict)
    }
    if not set(history_by_player_id).issubset(player_ids):
        raise ValueError('Player history references a player outside the normalized dataset')

    for rows in history_by_player_id.values():
        for row in rows:
            fixture = fixtures_by_id.get(int(row['fixtureId']))
            if fixture is None:
                raise ValueError('Player history references a fixture outside the normalized dataset')
            gameweek_id = int(row['gameweekId'])
            if gameweek_id not in event_ids or fixture.get('eventId') != gameweek_id:
                raise ValueError('Player history gameweek does not match the normalized fixture')
            opponent_team_id = int(row['opponentTeamId'])
            if opponent_team_id not in teams_by_id:
                raise ValueError('Player history references a team outside the normalized dataset')
            own_team_id = resolve_fixture_team_id(fixture, row)
            if own_team_id not in teams_by_id:
                raise ValueError('Player history fixture references a team outside the normalized dataset')


def resolve_fixture_team_id(fixture: JsonObject, history_row: JsonObject) -> int:
    opponent_team_id = int(history_row['opponentTeamId'])
    if require_boolean(history_row['wasHome'], 'history.wasHome'):
        team_id = int(fixture['teamHId'])
        if int(fixture['teamAId']) != opponent_team_id:
            raise ValueError('Normalized fixture opponent does not match player history')
        return team_id

    team_id = int(fixture['teamAId'])
    if int(fixture['teamHId']) != opponent_team_id:
        raise ValueError('Normalized fixture opponent does not match player history')
    return team_id


def fixture_difficulty_for_team(fixture: JsonObject, home_away: str) -> int:
    if home_away == 'H':
        return int(fixture['teamHDifficulty'])
    return int(fixture['teamADifficulty'])


def normalize_prediction_feature_row(row: JsonObject) -> JsonObject:
    normalized = {
        'player_id': require_integer(row['player_id'], 'player_id'),
        'player_name': str(row['player_name']),
        'position': require_position(row['position']),
        'team_id': require_integer(row['team_id'], 'team_id'),
        'team_name': str(row.get('team_name') or row.get('team')),
        'price': to_float(row['price']),
        'availability_status': str(row['availability_status']),
        'chance_of_playing_next_round': to_optional_int(
            row.get('chance_of_playing_next_round'),
            'chance_of_playing_next_round',
        ),
        'chance_of_playing_this_round': to_optional_int(
            row.get('chance_of_playing_this_round'),
            'chance_of_playing_this_round',
        ),
        'total_points': require_integer(row['total_points'], 'total_points'),
        'form': to_float(row['form']),
        'recent_points_average': to_float(row.get('recent_points_average', row['form'])),
        'selected_by_percent': to_float(row['selected_by_percent']),
        'minutes': require_integer(row['minutes'], 'minutes'),
        'completed_gameweeks': require_integer(row.get('completed_gameweeks', 0), 'completed_gameweeks'),
        'season_points_average': to_float(row.get('season_points_average', row.get('points_per_game', 0))),
        'season_minutes_average': to_float(row.get('season_minutes_average', 0)),
        'rolling_points_average': to_float(row.get('rolling_points_average', row.get('recent_points_average', row['form']))),
        'rolling_minutes_average': to_float(row.get('rolling_minutes_average', row.get('season_minutes_average', 0))),
        'points_per_game': to_float(row['points_per_game']),
        'value_season': to_float(row['value_season']),
        'fixture_id': require_integer(row['fixture_id'], 'fixture_id'),
        'opponent_team_id': require_integer(row['opponent_team_id'], 'opponent_team_id'),
        'opponent_team': str(row['opponent_team']),
        'fixture_difficulty': require_integer(row['fixture_difficulty'], 'fixture_difficulty'),
        'upcoming_gameweek_id': require_integer(row['upcoming_gameweek_id'], 'upcoming_gameweek_id'),
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
    for column in FINITE_NUMERIC_FEATURE_COLUMNS:
        require_finite_number(row[column], column)
    for column in OPTIONAL_FINITE_NUMERIC_FEATURE_COLUMNS:
        if row[column] is not None:
            require_finite_number(row[column], column)
    for column in INTEGER_FEATURE_COLUMNS:
        require_integer(row[column], column)
    for column in OPTIONAL_FINITE_NUMERIC_FEATURE_COLUMNS:
        if row[column] is not None:
            require_integer(row[column], column)
    if row['position'] not in {'GK', 'DEF', 'MID', 'FWD'}:
        raise ValueError(f'Invalid position: {row["position"]}')
    if row['home_away'] not in {'H', 'A'}:
        raise ValueError(f'Invalid home_away: {row["home_away"]}')
    if int(row['upcoming_gameweek_id']) <= 0:
        raise ValueError('upcoming_gameweek_id must be positive')
    if 'target_points' in row:
        raise ValueError('Prediction feature rows must not include target_points')
    if int(row['fixture_id']) <= 0:
        raise ValueError('fixture_id must be positive')


def validate_training_feature_row(row: JsonObject) -> None:
    missing = [column for column in TRAINING_FEATURE_COLUMNS if column not in row]
    if missing:
        raise ValueError(f'Training row is missing required columns: {missing}')
    prediction_part = {column: row[column] for column in PREDICTION_FEATURE_COLUMNS}
    validate_prediction_feature_row(prediction_part)
    require_finite_number(row['target_points'], 'target_points')
    require_finite_number(row['target_minutes'], 'target_minutes')
    if row['target_minutes'] < 0:
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


def require_boolean(value: Any, label: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f'{label} must be a boolean')
    return value


def require_integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f'{label} must be an integer')
    return value


def require_bounded_integer(value: Any, label: str, minimum: int, maximum: int) -> int:
    parsed = require_integer(value, label)
    if parsed < minimum or parsed > maximum:
        raise ValueError(f'{label} must be between {minimum} and {maximum}')
    return parsed


def require_bounded_number(value: Any, label: str, minimum: float, maximum: float) -> float:
    require_finite_number(value, label)
    parsed = float(value)
    if parsed < minimum or parsed > maximum:
        raise ValueError(f'{label} must be between {minimum} and {maximum}')
    return parsed


def require_bounded_string(value: Any, label: str, minimum: int, maximum: int) -> str:
    if not isinstance(value, str) or len(value) < minimum or len(value) > maximum:
        raise ValueError(f'{label} must be a string between {minimum} and {maximum} characters')
    return value


def require_exact_keys(value: JsonObject, expected: set[str], label: str) -> None:
    if set(value) != expected:
        raise ValueError(f'{label} must contain exactly the supported fields')


def require_finite_number(value: Any, label: str) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{label} must be a finite number')
    try:
        finite = math.isfinite(float(value))
    except (OverflowError, TypeError, ValueError):
        finite = False
    if not finite:
        raise ValueError(f'{label} must be a finite number')


def to_float(value: Any) -> float:
    if isinstance(value, bool):
        raise ValueError('Boolean values are not valid numeric feature values')
    try:
        parsed = float(value)
    except (OverflowError, TypeError, ValueError):
        raise ValueError('Feature values must be finite numbers') from None
    if not math.isfinite(parsed):
        raise ValueError('Feature values must be finite')
    return parsed


def to_optional_int(value: Any, label: str) -> int | None:
    if value is None:
        return None
    return require_integer(value, label)


def mean(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    input_path = resolve_repo_path(args.input)

    if args.historical:
        output_path = resolve_repo_path(args.output or DEFAULT_TRAINING_OUTPUT)
        snapshot_dirs = discover_snapshot_dirs(input_path)
        rows = build_historical_training_rows(snapshot_dirs, rolling_window=args.rolling_window)
        print(f'Wrote {len(rows)} historical expected-points training rows from {len(snapshot_dirs)} snapshots to {output_path}')
        if not rows:
            print(
                'No historical training rows were produced from snapshots. '
                'Use pnpm.cmd run ingest:fpl:history and then pnpm.cmd run pipeline:features for official player history rows.'
            )
        write_jsonl(output_path, rows)
    else:
        history_path = resolve_repo_path(args.history)
        features_output = resolve_repo_path(args.features_output)
        training_output = resolve_repo_path(args.training_output)
        result = build_expected_points_feature_files(
            input_path,
            history_path,
            rolling_window=args.rolling_window
        )
        write_jsonl(features_output, result.prediction_rows)
        write_jsonl(training_output, result.training_rows)

        for message in result.messages:
            print(message)
        print(f'Wrote {len(result.prediction_rows)} expected-points feature rows to {features_output} ({result.prediction_source}).')
        print(f'Wrote {len(result.training_rows)} expected-points training rows to {training_output}.')
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
        help='Legacy output JSONL path used with --historical. Defaults to the training rows path.'
    )
    parser.add_argument(
        '--features-output',
        default=DEFAULT_FEATURE_OUTPUT,
        help='Current or latest historical prediction feature JSONL path.'
    )
    parser.add_argument(
        '--training-output',
        default=DEFAULT_TRAINING_OUTPUT,
        help='Historical target-bearing training feature JSONL path.'
    )
    parser.add_argument(
        '--history',
        default=DEFAULT_HISTORY_INPUT,
        help='Official player-gameweek history JSON file produced by ingest:fpl:history.'
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
