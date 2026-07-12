from __future__ import annotations

import hashlib
import json
import math
import os
import re
import stat
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Literal
from urllib.parse import urlsplit

JsonObject = dict[str, Any]
Dataset = dict[str, Any]
LayerName = Literal['bronze', 'silver', 'gold']

MAX_DATABASE_ID = 2_147_483_647
MAX_GAMEWEEK_ID = 38
MAX_PLAYERS = 2_000
MAX_TEAMS = 100
MAX_EVENTS = 100
MAX_FIXTURES = 5_000
MAX_SOURCES = 10

SEASON_PATTERN = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]*$')

INGESTION_FILES = {
    'manifest': 'manifest.json',
    'players': 'players.json',
    'teams': 'teams.json',
    'events': 'events.json',
    'fixtures': 'fixtures.json'
}

MAX_INGESTION_FILE_BYTES = {
    'manifest': 256 * 1024,
    'players': 8 * 1024 * 1024,
    'teams': 512 * 1024,
    'events': 512 * 1024,
    'fixtures': 8 * 1024 * 1024
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
        dataset[key] = read_bounded_json_file(
            file_path,
            file_name,
            MAX_INGESTION_FILE_BYTES[key]
        )

    return validate_ingestion_dataset(dataset)


def read_bounded_json_file(file_path: Path, file_name: str, max_bytes: int) -> Any:
    try:
        initial_stats = file_path.lstat()
    except FileNotFoundError:
        raise FileNotFoundError(f'Missing required JSON input file: {file_name}') from None
    except OSError:
        raise ValueError(f'Unable to inspect JSON input file: {file_name}') from None

    if not stat.S_ISREG(initial_stats.st_mode):
        raise ValueError(f'JSON input must be a regular file: {file_name}')
    if initial_stats.st_size > max_bytes:
        raise ValueError(f'JSON input exceeds its byte limit: {file_name}')

    open_flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    try:
        descriptor = os.open(file_path, open_flags)
    except OSError:
        raise ValueError(f'Unable to open JSON input file safely: {file_name}') from None

    try:
        with os.fdopen(descriptor, 'rb') as input_file:
            opened_stats = os.fstat(input_file.fileno())
            if (
                not stat.S_ISREG(opened_stats.st_mode)
                or (initial_stats.st_dev, initial_stats.st_ino) != (opened_stats.st_dev, opened_stats.st_ino)
                or opened_stats.st_size > max_bytes
            ):
                raise ValueError(f'JSON input changed or exceeded its byte limit: {file_name}')
            contents = input_file.read(max_bytes + 1)
            final_stats = os.fstat(input_file.fileno())
    except OSError:
        raise ValueError(f'Unable to read JSON input file safely: {file_name}') from None

    if (
        len(contents) > max_bytes
        or final_stats.st_size > max_bytes
        or len(contents) != final_stats.st_size
        or (opened_stats.st_size, opened_stats.st_mtime_ns) != (final_stats.st_size, final_stats.st_mtime_ns)
    ):
        raise ValueError(f'JSON input changed or exceeded its byte limit: {file_name}')

    try:
        decoded = contents.decode('utf-8')
        return json.loads(decoded, parse_constant=reject_non_standard_json_constant)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        raise ValueError(f'JSON input is not valid strict JSON: {file_name}') from None


def reject_non_standard_json_constant(_value: str) -> None:
    raise ValueError('Non-standard JSON numeric constants are not allowed')


def validate_ingestion_dataset(dataset: Dataset) -> Dataset:
    typed_dataset = require_exact_object(
        dataset,
        'dataset',
        {'manifest', 'players', 'teams', 'events', 'fixtures'}
    )
    manifest = validate_manifest(typed_dataset['manifest'])
    players = require_bounded_list(typed_dataset['players'], 'players', MAX_PLAYERS)
    teams = require_bounded_list(typed_dataset['teams'], 'teams', MAX_TEAMS)
    events = require_bounded_list(typed_dataset['events'], 'events', MAX_EVENTS)
    fixtures = require_bounded_list(typed_dataset['fixtures'], 'fixtures', MAX_FIXTURES)

    for index, player in enumerate(players):
        validate_player(player, f'players[{index}]')
    for index, team in enumerate(teams):
        validate_team(team, f'teams[{index}]')
    for index, event in enumerate(events):
        validate_event(event, f'events[{index}]')
    for index, fixture in enumerate(fixtures):
        validate_fixture(fixture, f'fixtures[{index}]')

    record_counts = manifest['recordCounts']
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

    for index, player in enumerate(players):
        typed_player = require_object(player, f'players[{index}]')
        if typed_player.get('teamId') not in team_ids:
            raise ValueError(f'players[{index}] references an unknown team')

    for index, fixture in enumerate(fixtures):
        typed_fixture = require_object(fixture, f'fixtures[{index}]')
        team_h_id = typed_fixture.get('teamHId')
        team_a_id = typed_fixture.get('teamAId')
        event_id = typed_fixture.get('eventId')
        if team_h_id == team_a_id or team_h_id not in team_ids or team_a_id not in team_ids:
            raise ValueError(f'fixtures[{index}] failed team reference validation')
        if event_id is not None and event_id not in event_ids:
            raise ValueError(f'fixtures[{index}] references an unknown gameweek')

    return {
        'manifest': manifest,
        'players': players,
        'teams': teams,
        'events': events,
        'fixtures': fixtures
    }


def validate_manifest(value: Any) -> JsonObject:
    manifest = require_exact_object(
        value,
        'manifest',
        {'schemaVersion', 'season', 'generatedAt', 'currentEventId', 'sources', 'recordCounts'}
    )
    schema_version = require_integer(manifest['schemaVersion'], 'manifest.schemaVersion', 1, 1)
    if schema_version != 1:
        raise ValueError('manifest.schemaVersion is not supported')

    season = manifest['season']
    if season is not None:
        typed_season = require_string(season, 'manifest.season', 1, 32)
        if SEASON_PATTERN.fullmatch(typed_season) is None:
            raise ValueError('manifest.season has an invalid format')

    require_datetime(manifest['generatedAt'], 'manifest.generatedAt')
    require_nullable_integer(manifest['currentEventId'], 'manifest.currentEventId', 1, MAX_GAMEWEEK_ID)

    sources = require_bounded_list(manifest['sources'], 'manifest.sources', MAX_SOURCES, min_length=1)
    for index, source_value in enumerate(sources):
        source = require_exact_object(
            source_value,
            f'manifest.sources[{index}]',
            {'name', 'url', 'fetchedAt', 'httpDate', 'etag', 'lastModified'}
        )
        require_string(source['name'], f'manifest.sources[{index}].name', 1, 100)
        require_http_url(source['url'], f'manifest.sources[{index}].url')
        require_datetime(source['fetchedAt'], f'manifest.sources[{index}].fetchedAt')
        for field_name in ('httpDate', 'etag', 'lastModified'):
            field_value = source[field_name]
            if field_value is not None:
                require_string(field_value, f'manifest.sources[{index}].{field_name}', 0, 1_000)

    record_counts = require_exact_object(
        manifest['recordCounts'],
        'manifest.recordCounts',
        {'players', 'teams', 'events', 'fixtures'}
    )
    require_integer(record_counts['players'], 'manifest.recordCounts.players', 0, MAX_PLAYERS)
    require_integer(record_counts['teams'], 'manifest.recordCounts.teams', 0, MAX_TEAMS)
    require_integer(record_counts['events'], 'manifest.recordCounts.events', 0, MAX_EVENTS)
    require_integer(record_counts['fixtures'], 'manifest.recordCounts.fixtures', 0, MAX_FIXTURES)
    return manifest


def validate_player(value: Any, label: str) -> None:
    player = require_exact_object(
        value,
        label,
        {
            'id', 'code', 'firstName', 'secondName', 'webName', 'displayName', 'teamId',
            'position', 'nowCost', 'status', 'chanceOfPlayingNextRound',
            'chanceOfPlayingThisRound', 'form', 'selectedByPercent', 'pointsPerGame',
            'valueSeason', 'totalPoints', 'minutes', 'starts', 'expectedGoals',
            'expectedAssists', 'expectedGoalInvolvements', 'expectedGoalsConceded'
        }
    )
    require_integer(player['id'], f'{label}.id', 1, MAX_DATABASE_ID)
    require_nullable_integer(player['code'], f'{label}.code', 1, MAX_DATABASE_ID)
    require_string(player['firstName'], f'{label}.firstName', 0, 100)
    require_string(player['secondName'], f'{label}.secondName', 0, 100)
    require_string(player['webName'], f'{label}.webName', 0, 100)
    require_string(player['displayName'], f'{label}.displayName', 1, 200)
    require_integer(player['teamId'], f'{label}.teamId', 1, MAX_DATABASE_ID)
    position = require_string(player['position'], f'{label}.position', 1, 3)
    if position not in {'GK', 'DEF', 'MID', 'FWD'}:
        raise ValueError(f'{label}.position is invalid')
    require_number(player['nowCost'], f'{label}.nowCost', 0, 100)
    require_string(player['status'], f'{label}.status', 1, 32)
    require_nullable_integer(player['chanceOfPlayingNextRound'], f'{label}.chanceOfPlayingNextRound', 0, 100)
    require_nullable_integer(player['chanceOfPlayingThisRound'], f'{label}.chanceOfPlayingThisRound', 0, 100)
    require_number(player['form'], f'{label}.form', -100, 100)
    require_number(player['selectedByPercent'], f'{label}.selectedByPercent', 0, 100)
    require_number(player['pointsPerGame'], f'{label}.pointsPerGame', 0, 100)
    require_number(player['valueSeason'], f'{label}.valueSeason', 0, 1_000)
    require_integer(player['totalPoints'], f'{label}.totalPoints', -1_000, 10_000)
    require_integer(player['minutes'], f'{label}.minutes', 0, 10_000)
    require_integer(player['starts'], f'{label}.starts', 0, 100)
    require_number(player['expectedGoals'], f'{label}.expectedGoals', 0, 1_000)
    require_number(player['expectedAssists'], f'{label}.expectedAssists', 0, 1_000)
    require_number(player['expectedGoalInvolvements'], f'{label}.expectedGoalInvolvements', 0, 1_000)
    require_number(player['expectedGoalsConceded'], f'{label}.expectedGoalsConceded', 0, 1_000)


def validate_team(value: Any, label: str) -> None:
    team = require_exact_object(
        value,
        label,
        {'id', 'code', 'name', 'shortName', 'strength', 'strengthOverallHome', 'strengthOverallAway'}
    )
    require_integer(team['id'], f'{label}.id', 1, MAX_DATABASE_ID)
    require_nullable_integer(team['code'], f'{label}.code', 1, MAX_DATABASE_ID)
    require_string(team['name'], f'{label}.name', 1, 100)
    require_string(team['shortName'], f'{label}.shortName', 1, 10)
    require_nullable_integer(team['strength'], f'{label}.strength', 0, 10_000)
    require_nullable_integer(team['strengthOverallHome'], f'{label}.strengthOverallHome', 0, 10_000)
    require_nullable_integer(team['strengthOverallAway'], f'{label}.strengthOverallAway', 0, 10_000)


def validate_event(value: Any, label: str) -> None:
    event = require_exact_object(
        value,
        label,
        {
            'id', 'name', 'deadlineTime', 'averageEntryScore', 'highestScore', 'finished',
            'dataChecked', 'isCurrent', 'isNext'
        }
    )
    require_integer(event['id'], f'{label}.id', 1, MAX_GAMEWEEK_ID)
    require_string(event['name'], f'{label}.name', 1, 100)
    require_datetime(event['deadlineTime'], f'{label}.deadlineTime')
    require_nullable_number(event['averageEntryScore'], f'{label}.averageEntryScore', 0, 1_000)
    require_nullable_number(event['highestScore'], f'{label}.highestScore', 0, 1_000)
    require_boolean(event['finished'], f'{label}.finished')
    require_boolean(event['dataChecked'], f'{label}.dataChecked')
    require_boolean(event['isCurrent'], f'{label}.isCurrent')
    require_boolean(event['isNext'], f'{label}.isNext')


def validate_fixture(value: Any, label: str) -> None:
    fixture = require_exact_object(
        value,
        label,
        {
            'id', 'code', 'eventId', 'kickoffTime', 'teamHId', 'teamAId', 'teamHScore',
            'teamAScore', 'teamHDifficulty', 'teamADifficulty', 'started', 'finished'
        }
    )
    require_integer(fixture['id'], f'{label}.id', 1, MAX_DATABASE_ID)
    require_nullable_integer(fixture['code'], f'{label}.code', 1, MAX_DATABASE_ID)
    require_nullable_integer(fixture['eventId'], f'{label}.eventId', 1, MAX_GAMEWEEK_ID)
    if fixture['kickoffTime'] is not None:
        require_datetime(fixture['kickoffTime'], f'{label}.kickoffTime')
    require_integer(fixture['teamHId'], f'{label}.teamHId', 1, MAX_DATABASE_ID)
    require_integer(fixture['teamAId'], f'{label}.teamAId', 1, MAX_DATABASE_ID)
    require_nullable_integer(fixture['teamHScore'], f'{label}.teamHScore', 0, 100)
    require_nullable_integer(fixture['teamAScore'], f'{label}.teamAScore', 0, 100)
    require_integer(fixture['teamHDifficulty'], f'{label}.teamHDifficulty', 1, 5)
    require_integer(fixture['teamADifficulty'], f'{label}.teamADifficulty', 1, 5)
    require_boolean(fixture['started'], f'{label}.started')
    require_boolean(fixture['finished'], f'{label}.finished')


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
    completed_gameweeks = count_completed_gameweeks_before(gameweeks, next_gameweek_id)
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
                        'team_name': player['team_name'],
                        'price': player['price'],
                        'availability_status': player['status'],
                        'chance_of_playing_next_round': player['chance_of_playing_next_round'],
                        'chance_of_playing_this_round': player['chance_of_playing_this_round'],
                        'total_points': player['total_points'],
                        'form': player['form'],
                        'recent_points_average': player['form'],
                        'selected_by_percent': player['selected_by_percent'],
                        'minutes': player['minutes'],
                        'completed_gameweeks': completed_gameweeks,
                        'season_points_average': average_or_fallback(
                            player['total_points'],
                            completed_gameweeks,
                            player['points_per_game']
                        ),
                        'season_minutes_average': average_or_fallback(player['minutes'], completed_gameweeks, 0),
                        'rolling_points_average': player['form'],
                        'rolling_minutes_average': average_or_fallback(player['minutes'], completed_gameweeks, 0),
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


def require_exact_object(value: Any, label: str, expected_keys: set[str]) -> JsonObject:
    typed_value = require_object(value, label)
    if set(typed_value) != expected_keys:
        raise ValueError(f'{label} does not match the required object schema')
    return typed_value


def require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f'Expected {label} to be a list')
    return value


def require_bounded_list(value: Any, label: str, max_length: int, min_length: int = 0) -> list[Any]:
    typed_value = require_list(value, label)
    if len(typed_value) < min_length or len(typed_value) > max_length:
        raise ValueError(f'{label} has an invalid number of entries')
    return typed_value


def require_string(value: Any, label: str, min_length: int, max_length: int) -> str:
    if not isinstance(value, str) or len(value) < min_length or len(value) > max_length:
        raise ValueError(f'{label} must be a string with a valid length')
    return value


def require_integer(value: Any, label: str, minimum: int, maximum: int) -> int:
    if type(value) is not int or value < minimum or value > maximum:
        raise ValueError(f'{label} must be an integer in the allowed range')
    return value


def require_nullable_integer(value: Any, label: str, minimum: int, maximum: int) -> int | None:
    if value is None:
        return None
    return require_integer(value, label, minimum, maximum)


def require_number(value: Any, label: str, minimum: float, maximum: float) -> int | float:
    if type(value) not in (int, float):
        raise ValueError(f'{label} must be a finite number in the allowed range')
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f'{label} must be a finite number in the allowed range')
    if value < minimum or value > maximum:
        raise ValueError(f'{label} must be a finite number in the allowed range')
    return value


def require_nullable_number(value: Any, label: str, minimum: float, maximum: float) -> int | float | None:
    if value is None:
        return None
    return require_number(value, label, minimum, maximum)


def require_boolean(value: Any, label: str) -> bool:
    if type(value) is not bool:
        raise ValueError(f'{label} must be a boolean')
    return value


def require_datetime(value: Any, label: str) -> str:
    typed_value = require_string(value, label, 1, 64)
    if 'T' not in typed_value:
        raise ValueError(f'{label} must be an ISO 8601 date-time with an offset')
    parseable_value = f'{typed_value[:-1]}+00:00' if typed_value.endswith('Z') else typed_value
    try:
        parsed = datetime.fromisoformat(parseable_value)
    except ValueError as error:
        raise ValueError(f'{label} must be an ISO 8601 date-time with an offset') from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f'{label} must be an ISO 8601 date-time with an offset')
    return typed_value


def require_http_url(value: Any, label: str) -> str:
    typed_value = require_string(value, label, 1, 2_048)
    try:
        parsed = urlsplit(typed_value)
        hostname = parsed.hostname
    except ValueError as error:
        raise ValueError(f'{label} must be an HTTP(S) URL without embedded credentials') from error
    if (
        parsed.scheme not in {'http', 'https'}
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError(f'{label} must be an HTTP(S) URL without embedded credentials')
    return typed_value


def require_unique_ids(records: Iterable[Any], label: str) -> set[int]:
    seen: set[int] = set()
    for record in records:
        typed_record = require_object(record, f'{label}[]')
        record_id = typed_record.get('id')
        if type(record_id) is not int or record_id <= 0 or record_id > MAX_DATABASE_ID:
            raise ValueError(f'{label} contains an invalid id')
        if record_id in seen:
            raise ValueError(f'{label} contains a duplicate id')
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


def count_completed_gameweeks_before(gameweeks: list[JsonObject], target_gameweek_id: int | None) -> int:
    return len([
        gameweek
        for gameweek in gameweeks
        if gameweek['finished']
        and gameweek['data_checked']
        and (target_gameweek_id is None or gameweek['gameweek_id'] < target_gameweek_id)
    ])


def average_or_fallback(value: int | float | None, count: int, fallback: int | float) -> float:
    if count <= 0 or value is None:
        return float(fallback)
    return round(float(value) / count, 4)


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
