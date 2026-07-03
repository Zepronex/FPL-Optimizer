from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Literal

JsonObject = dict[str, Any]
Dataset = dict[str, Any]
LayerName = Literal['bronze', 'silver', 'gold']

INGESTION_FILES = {
    'manifest': 'manifest.json',
    'players': 'players.json',
    'teams': 'teams.json',
    'events': 'events.json',
    'fixtures': 'fixtures.json'
}

BRONZE_TABLE_COLUMNS: dict[str, tuple[str, ...]] = {
    'ingestion_manifest': (
        'snapshot_hash',
        'schema_version',
        'season',
        'generated_at',
        'current_event_id',
        'record_counts_json',
        'sources_json',
        'bronze_loaded_at'
    ),
    'source_metadata': (
        'source_snapshot_hash',
        'source_index',
        'source_name',
        'source_url',
        'fetched_at',
        'http_date',
        'etag',
        'last_modified',
        'bronze_loaded_at'
    ),
    'players_raw': (
        'record_id',
        'record_type',
        'source_snapshot_hash',
        'source_schema_version',
        'source_generated_at',
        'season',
        'raw_record_json',
        'bronze_loaded_at'
    ),
    'teams_raw': (
        'record_id',
        'record_type',
        'source_snapshot_hash',
        'source_schema_version',
        'source_generated_at',
        'season',
        'raw_record_json',
        'bronze_loaded_at'
    ),
    'gameweeks_raw': (
        'record_id',
        'record_type',
        'source_snapshot_hash',
        'source_schema_version',
        'source_generated_at',
        'season',
        'raw_record_json',
        'bronze_loaded_at'
    ),
    'fixtures_raw': (
        'record_id',
        'record_type',
        'source_snapshot_hash',
        'source_schema_version',
        'source_generated_at',
        'season',
        'raw_record_json',
        'bronze_loaded_at'
    )
}

SILVER_TABLE_COLUMNS: dict[str, tuple[str, ...]] = {
    'players': (
        'player_id',
        'code',
        'first_name',
        'second_name',
        'web_name',
        'player_name',
        'team_id',
        'team_name',
        'team_short_name',
        'position',
        'price',
        'status',
        'chance_of_playing_next_round',
        'chance_of_playing_this_round',
        'form',
        'selected_by_percent',
        'points_per_game',
        'value_season',
        'total_points',
        'minutes',
        'starts',
        'expected_goals',
        'expected_assists',
        'expected_goal_involvements',
        'expected_goals_conceded',
        'source_snapshot_hash',
        'source_generated_at',
        'season'
    ),
    'teams': (
        'team_id',
        'code',
        'team_name',
        'team_short_name',
        'strength',
        'strength_overall_home',
        'strength_overall_away',
        'source_snapshot_hash',
        'source_generated_at',
        'season'
    ),
    'gameweeks': (
        'gameweek_id',
        'name',
        'deadline_time',
        'average_entry_score',
        'highest_score',
        'finished',
        'data_checked',
        'is_current',
        'is_next',
        'source_snapshot_hash',
        'source_generated_at',
        'season'
    ),
    'fixtures': (
        'fixture_id',
        'code',
        'gameweek_id',
        'kickoff_time',
        'team_h_id',
        'team_h_name',
        'team_a_id',
        'team_a_name',
        'team_h_score',
        'team_a_score',
        'team_h_difficulty',
        'team_a_difficulty',
        'started',
        'finished',
        'source_snapshot_hash',
        'source_generated_at',
        'season'
    )
}

GOLD_TABLE_COLUMNS: dict[str, tuple[str, ...]] = {
    'team_fixture_features': (
        'fixture_id',
        'upcoming_gameweek_id',
        'team_id',
        'team',
        'opponent_team_id',
        'opponent_team',
        'home_away',
        'fixture_difficulty',
        'kickoff_time',
        'source_snapshot_hash',
        'source_generated_at',
        'season'
    ),
    'player_gameweek_features': (
        'player_id',
        'player_name',
        'position',
        'team_id',
        'team',
        'price',
        'availability_status',
        'chance_of_playing_next_round',
        'chance_of_playing_this_round',
        'total_points',
        'form',
        'selected_by_percent',
        'minutes',
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
}

TABLE_COLUMNS_BY_LAYER = {
    'bronze': BRONZE_TABLE_COLUMNS,
    'silver': SILVER_TABLE_COLUMNS,
    'gold': GOLD_TABLE_COLUMNS
}


def read_ingestion_dataset(input_dir: str | Path) -> Dataset:
    base_dir = Path(input_dir)
    dataset: Dataset = {}

    for key, file_name in INGESTION_FILES.items():
        file_path = base_dir / file_name
        if not file_path.exists():
            raise FileNotFoundError(f'Missing ingestion file: {file_path}')
        dataset[key] = json.loads(file_path.read_text(encoding='utf-8'))

    return validate_ingestion_dataset(dataset)


def validate_ingestion_dataset(dataset: Dataset) -> Dataset:
    manifest = require_object(dataset.get('manifest'), 'manifest')
    players = require_list(dataset.get('players'), 'players')
    teams = require_list(dataset.get('teams'), 'teams')
    events = require_list(dataset.get('events'), 'events')
    fixtures = require_list(dataset.get('fixtures'), 'fixtures')

    record_counts = require_object(manifest.get('recordCounts'), 'manifest.recordCounts')
    expected_counts = {
        'players': len(players),
        'teams': len(teams),
        'events': len(events),
        'fixtures': len(fixtures)
    }
    if record_counts != expected_counts:
        raise ValueError(
            f'Manifest counts do not match normalized files: expected {record_counts}, received {expected_counts}'
        )

    team_ids = require_unique_ids(teams, 'teams')
    event_ids = require_unique_ids(events, 'events')
    require_unique_ids(players, 'players')
    require_unique_ids(fixtures, 'fixtures')

    for player in players:
        typed_player = require_object(player, 'players[]')
        if typed_player.get('teamId') not in team_ids:
            raise ValueError(f'Player {typed_player.get("id")} references unknown team {typed_player.get("teamId")}')
        if typed_player.get('position') not in {'GK', 'DEF', 'MID', 'FWD'}:
            raise ValueError(f'Player {typed_player.get("id")} has invalid position {typed_player.get("position")}')

    for fixture in fixtures:
        typed_fixture = require_object(fixture, 'fixtures[]')
        team_h_id = typed_fixture.get('teamHId')
        team_a_id = typed_fixture.get('teamAId')
        event_id = typed_fixture.get('eventId')
        if team_h_id == team_a_id or team_h_id not in team_ids or team_a_id not in team_ids:
            raise ValueError(f'Fixture {typed_fixture.get("id")} failed team reference validation')
        if event_id is not None and event_id not in event_ids:
            raise ValueError(f'Fixture {typed_fixture.get("id")} references unknown gameweek {event_id}')

    return {
        'manifest': manifest,
        'players': players,
        'teams': teams,
        'events': events,
        'fixtures': fixtures
    }


def dataset_snapshot_hash(dataset: Dataset) -> str:
    validated = validate_ingestion_dataset(dataset)
    canonical_dataset = {
        'manifest': validated['manifest'],
        'teams': sort_records_by_id(validated['teams']),
        'players': sort_records_by_id(validated['players']),
        'events': sort_records_by_id(validated['events']),
        'fixtures': sort_records_by_id(validated['fixtures'])
    }
    return hashlib.sha256(stable_json_dumps(canonical_dataset).encode('utf-8')).hexdigest()


def build_bronze_tables(dataset: Dataset, loaded_at: str | None = None) -> dict[str, list[JsonObject]]:
    validated = validate_ingestion_dataset(dataset)
    manifest = validated['manifest']
    snapshot_hash = dataset_snapshot_hash(validated)
    bronze_loaded_at = loaded_at or utc_now()
    source_schema_version = manifest['schemaVersion']
    source_generated_at = manifest['generatedAt']
    season = manifest.get('season')

    tables = {
        'ingestion_manifest': [
            select_columns(
                {
                    'snapshot_hash': snapshot_hash,
                    'schema_version': source_schema_version,
                    'season': season,
                    'generated_at': source_generated_at,
                    'current_event_id': manifest.get('currentEventId'),
                    'record_counts_json': stable_json_dumps(manifest['recordCounts']),
                    'sources_json': stable_json_dumps(manifest.get('sources', [])),
                    'bronze_loaded_at': bronze_loaded_at
                },
                BRONZE_TABLE_COLUMNS['ingestion_manifest']
            )
        ],
        'source_metadata': [
            select_columns(
                {
                    'source_snapshot_hash': snapshot_hash,
                    'source_index': index,
                    'source_name': source.get('name'),
                    'source_url': source.get('url'),
                    'fetched_at': source.get('fetchedAt'),
                    'http_date': source.get('httpDate'),
                    'etag': source.get('etag'),
                    'last_modified': source.get('lastModified'),
                    'bronze_loaded_at': bronze_loaded_at
                },
                BRONZE_TABLE_COLUMNS['source_metadata']
            )
            for index, source in enumerate(require_list(manifest.get('sources', []), 'manifest.sources'))
        ],
        'players_raw': build_raw_rows(
            validated['players'],
            'player',
            snapshot_hash,
            source_schema_version,
            source_generated_at,
            season,
            bronze_loaded_at
        ),
        'teams_raw': build_raw_rows(
            validated['teams'],
            'team',
            snapshot_hash,
            source_schema_version,
            source_generated_at,
            season,
            bronze_loaded_at
        ),
        'gameweeks_raw': build_raw_rows(
            validated['events'],
            'gameweek',
            snapshot_hash,
            source_schema_version,
            source_generated_at,
            season,
            bronze_loaded_at
        ),
        'fixtures_raw': build_raw_rows(
            validated['fixtures'],
            'fixture',
            snapshot_hash,
            source_schema_version,
            source_generated_at,
            season,
            bronze_loaded_at
        )
    }
    assert_table_columns(tables, BRONZE_TABLE_COLUMNS)
    return tables


def build_silver_tables(dataset: Dataset) -> dict[str, list[JsonObject]]:
    validated = validate_ingestion_dataset(dataset)
    manifest = validated['manifest']
    snapshot_hash = dataset_snapshot_hash(validated)
    metadata = {
        'source_snapshot_hash': snapshot_hash,
        'source_generated_at': manifest['generatedAt'],
        'season': manifest.get('season')
    }
    teams_by_id = {team['id']: team for team in validated['teams']}

    teams = [
        select_columns(
            {
                'team_id': team['id'],
                'code': team.get('code'),
                'team_name': team['name'],
                'team_short_name': team['shortName'],
                'strength': team.get('strength'),
                'strength_overall_home': team.get('strengthOverallHome'),
                'strength_overall_away': team.get('strengthOverallAway'),
                **metadata
            },
            SILVER_TABLE_COLUMNS['teams']
        )
        for team in sort_records_by_id(validated['teams'])
    ]

    players = [
        select_columns(
            {
                'player_id': player['id'],
                'code': player.get('code'),
                'first_name': player['firstName'],
                'second_name': player['secondName'],
                'web_name': player['webName'],
                'player_name': player['displayName'],
                'team_id': player['teamId'],
                'team_name': teams_by_id[player['teamId']]['name'],
                'team_short_name': teams_by_id[player['teamId']]['shortName'],
                'position': player['position'],
                'price': player['nowCost'],
                'status': player['status'],
                'chance_of_playing_next_round': player.get('chanceOfPlayingNextRound'),
                'chance_of_playing_this_round': player.get('chanceOfPlayingThisRound'),
                'form': player['form'],
                'selected_by_percent': player['selectedByPercent'],
                'points_per_game': player['pointsPerGame'],
                'value_season': player['valueSeason'],
                'total_points': player['totalPoints'],
                'minutes': player['minutes'],
                'starts': player['starts'],
                'expected_goals': player['expectedGoals'],
                'expected_assists': player['expectedAssists'],
                'expected_goal_involvements': player['expectedGoalInvolvements'],
                'expected_goals_conceded': player['expectedGoalsConceded'],
                **metadata
            },
            SILVER_TABLE_COLUMNS['players']
        )
        for player in sort_records_by_id(validated['players'])
    ]

    gameweeks = [
        select_columns(
            {
                'gameweek_id': event['id'],
                'name': event['name'],
                'deadline_time': event['deadlineTime'],
                'average_entry_score': event.get('averageEntryScore'),
                'highest_score': event.get('highestScore'),
                'finished': event['finished'],
                'data_checked': event['dataChecked'],
                'is_current': event['isCurrent'],
                'is_next': event['isNext'],
                **metadata
            },
            SILVER_TABLE_COLUMNS['gameweeks']
        )
        for event in sort_records_by_id(validated['events'])
    ]

    fixtures = [
        select_columns(
            {
                'fixture_id': fixture['id'],
                'code': fixture.get('code'),
                'gameweek_id': fixture.get('eventId'),
                'kickoff_time': fixture.get('kickoffTime'),
                'team_h_id': fixture['teamHId'],
                'team_h_name': teams_by_id[fixture['teamHId']]['name'],
                'team_a_id': fixture['teamAId'],
                'team_a_name': teams_by_id[fixture['teamAId']]['name'],
                'team_h_score': fixture.get('teamHScore'),
                'team_a_score': fixture.get('teamAScore'),
                'team_h_difficulty': fixture['teamHDifficulty'],
                'team_a_difficulty': fixture['teamADifficulty'],
                'started': fixture['started'],
                'finished': fixture['finished'],
                **metadata
            },
            SILVER_TABLE_COLUMNS['fixtures']
        )
        for fixture in sort_records_by_id(validated['fixtures'])
    ]

    tables = {
        'players': players,
        'teams': teams,
        'gameweeks': gameweeks,
        'fixtures': fixtures
    }
    assert_table_columns(tables, SILVER_TABLE_COLUMNS)
    return tables


def build_gold_tables(silver_tables: dict[str, list[JsonObject]]) -> dict[str, list[JsonObject]]:
    players = sorted(silver_tables['players'], key=lambda player: player['player_id'])
    teams = sorted(silver_tables['teams'], key=lambda team: team['team_id'])
    gameweeks = sorted(silver_tables['gameweeks'], key=lambda gameweek: gameweek['gameweek_id'])
    fixtures = sorted(silver_tables['fixtures'], key=lambda fixture: fixture['fixture_id'])
    teams_by_id = {team['team_id']: team for team in teams}

    next_gameweek_id = select_next_gameweek_id(gameweeks, fixtures)
    upcoming_fixtures = [
        fixture
        for fixture in fixtures
        if next_gameweek_id is not None
        and fixture['gameweek_id'] == next_gameweek_id
        and not fixture['started']
        and not fixture['finished']
    ]

    team_fixture_features = []
    for fixture in upcoming_fixtures:
        team_fixture_features.extend(build_team_fixture_feature_rows(fixture, teams_by_id))
    team_fixture_features.sort(key=lambda row: (row['fixture_id'], row['team_id']))

    fixtures_by_team: dict[int, list[JsonObject]] = {}
    for fixture_feature in team_fixture_features:
        fixtures_by_team.setdefault(fixture_feature['team_id'], []).append(fixture_feature)

    player_gameweek_features = []
    for player in players:
        for fixture_feature in fixtures_by_team.get(player['team_id'], []):
            player_gameweek_features.append(
                select_columns(
                    {
                        'player_id': player['player_id'],
                        'player_name': player['player_name'],
                        'position': player['position'],
                        'team_id': player['team_id'],
                        'team': player['team_name'],
                        'price': player['price'],
                        'availability_status': player['status'],
                        'chance_of_playing_next_round': player['chance_of_playing_next_round'],
                        'chance_of_playing_this_round': player['chance_of_playing_this_round'],
                        'total_points': player['total_points'],
                        'form': player['form'],
                        'selected_by_percent': player['selected_by_percent'],
                        'minutes': player['minutes'],
                        'points_per_game': player['points_per_game'],
                        'value_season': player['value_season'],
                        'fixture_id': fixture_feature['fixture_id'],
                        'opponent_team_id': fixture_feature['opponent_team_id'],
                        'opponent_team': fixture_feature['opponent_team'],
                        'fixture_difficulty': fixture_feature['fixture_difficulty'],
                        'upcoming_gameweek_id': fixture_feature['upcoming_gameweek_id'],
                        'home_away': fixture_feature['home_away'],
                        'source_snapshot_hash': player['source_snapshot_hash'],
                        'source_generated_at': player['source_generated_at'],
                        'season': player['season']
                    },
                    GOLD_TABLE_COLUMNS['player_gameweek_features']
                )
            )

    tables = {
        'team_fixture_features': team_fixture_features,
        'player_gameweek_features': player_gameweek_features
    }
    assert_table_columns(tables, GOLD_TABLE_COLUMNS)
    return tables


def build_layer_tables(layer: LayerName, dataset: Dataset, loaded_at: str | None = None) -> dict[str, list[JsonObject]]:
    if layer == 'bronze':
        return build_bronze_tables(dataset, loaded_at=loaded_at)
    if layer == 'silver':
        return build_silver_tables(dataset)
    if layer == 'gold':
        return build_gold_tables(build_silver_tables(dataset))
    raise ValueError(f'Unsupported layer: {layer}')


def assert_table_columns(tables: dict[str, list[JsonObject]], expected: dict[str, tuple[str, ...]]) -> None:
    if set(tables) != set(expected):
        raise ValueError(f'Unexpected tables: expected {sorted(expected)}, received {sorted(tables)}')

    for table_name, rows in tables.items():
        expected_columns = expected[table_name]
        for index, row in enumerate(rows):
            if tuple(row.keys()) != expected_columns:
                raise ValueError(
                    f'{table_name}[{index}] columns do not match contract: '
                    f'expected {expected_columns}, received {tuple(row.keys())}'
                )


def stable_json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def select_columns(row: JsonObject, columns: Iterable[str]) -> JsonObject:
    return {column: row.get(column) for column in columns}


def sort_records_by_id(records: Iterable[Any]) -> list[JsonObject]:
    typed_records = [require_object(record, 'record') for record in records]
    return sorted(typed_records, key=lambda record: record['id'])


def require_object(value: Any, label: str) -> JsonObject:
    if not isinstance(value, dict):
        raise ValueError(f'Expected {label} to be an object')
    return value


def require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f'Expected {label} to be a list')
    return value


def require_unique_ids(records: Iterable[Any], label: str) -> set[int]:
    seen: set[int] = set()
    for record in records:
        typed_record = require_object(record, f'{label}[]')
        record_id = typed_record.get('id')
        if not isinstance(record_id, int) or record_id <= 0:
            raise ValueError(f'{label} contains invalid id {record_id}')
        if record_id in seen:
            raise ValueError(f'Duplicate {label} id {record_id}')
        seen.add(record_id)
    return seen


def build_raw_rows(
    records: Iterable[Any],
    record_type: str,
    snapshot_hash: str,
    source_schema_version: int,
    source_generated_at: str,
    season: str | None,
    bronze_loaded_at: str
) -> list[JsonObject]:
    columns = BRONZE_TABLE_COLUMNS[f'{record_type}s_raw'] if record_type != 'gameweek' else BRONZE_TABLE_COLUMNS['gameweeks_raw']
    return [
        select_columns(
            {
                'record_id': record['id'],
                'record_type': record_type,
                'source_snapshot_hash': snapshot_hash,
                'source_schema_version': source_schema_version,
                'source_generated_at': source_generated_at,
                'season': season,
                'raw_record_json': stable_json_dumps(record),
                'bronze_loaded_at': bronze_loaded_at
            },
            columns
        )
        for record in sort_records_by_id(records)
    ]


def select_next_gameweek_id(gameweeks: list[JsonObject], fixtures: list[JsonObject]) -> int | None:
    next_gameweeks = [gameweek['gameweek_id'] for gameweek in gameweeks if gameweek['is_next']]
    if next_gameweeks:
        return min(next_gameweeks)

    current_gameweeks = [gameweek['gameweek_id'] for gameweek in gameweeks if gameweek['is_current']]
    current_gameweek_id = max(current_gameweeks) if current_gameweeks else None
    upcoming_fixture_gameweeks = sorted({
        fixture['gameweek_id']
        for fixture in fixtures
        if fixture['gameweek_id'] is not None and not fixture['started'] and not fixture['finished']
    })

    if current_gameweek_id is not None:
        future_gameweeks = [gameweek_id for gameweek_id in upcoming_fixture_gameweeks if gameweek_id > current_gameweek_id]
        if future_gameweeks:
            return future_gameweeks[0]

    return upcoming_fixture_gameweeks[0] if upcoming_fixture_gameweeks else None


def build_team_fixture_feature_rows(fixture: JsonObject, teams_by_id: dict[int, JsonObject]) -> list[JsonObject]:
    home_team = teams_by_id[fixture['team_h_id']]
    away_team = teams_by_id[fixture['team_a_id']]
    metadata = {
        'fixture_id': fixture['fixture_id'],
        'upcoming_gameweek_id': fixture['gameweek_id'],
        'kickoff_time': fixture['kickoff_time'],
        'source_snapshot_hash': fixture['source_snapshot_hash'],
        'source_generated_at': fixture['source_generated_at'],
        'season': fixture['season']
    }

    return [
        select_columns(
            {
                **metadata,
                'team_id': home_team['team_id'],
                'team': home_team['team_name'],
                'opponent_team_id': away_team['team_id'],
                'opponent_team': away_team['team_name'],
                'home_away': 'H',
                'fixture_difficulty': fixture['team_h_difficulty']
            },
            GOLD_TABLE_COLUMNS['team_fixture_features']
        ),
        select_columns(
            {
                **metadata,
                'team_id': away_team['team_id'],
                'team': away_team['team_name'],
                'opponent_team_id': home_team['team_id'],
                'opponent_team': home_team['team_name'],
                'home_away': 'A',
                'fixture_difficulty': fixture['team_a_difficulty']
            },
            GOLD_TABLE_COLUMNS['team_fixture_features']
        )
    ]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
