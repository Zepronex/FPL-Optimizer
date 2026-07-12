#!/usr/bin/env python3
"""Package a reproducible, public-only FPL snapshot for Databricks.

The normal mode copies the repository's normalized public FPL files byte-for-byte.
The optional test-fixture mode creates a small, referentially intact subset of the
same public data. Metadata contains only logical filenames, public source URLs,
source timestamps, counts, and hashes; local filesystem paths are never written.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from pipelines.databricks.transforms import (  # noqa: E402
    Dataset,
    MAX_INGESTION_FILE_BYTES,
    dataset_snapshot_hash,
    read_bounded_json_file,
    read_ingestion_dataset,
    validate_ingestion_dataset,
)


NORMALIZED_FILENAMES = (
    "manifest.json",
    "players.json",
    "teams.json",
    "events.json",
    "fixtures.json",
)
HISTORY_FILENAME = "player_gameweek_history.json"
METADATA_FILENAME = "snapshot_metadata.json"
PACKAGED_FILENAMES = NORMALIZED_FILENAMES + (HISTORY_FILENAME,)
OUTPUT_FILENAMES = frozenset(PACKAGED_FILENAMES + (METADATA_FILENAME,))
POSITION_ORDER = ("GK", "DEF", "MID", "FWD")
MAX_HISTORY_FILE_BYTES = 32 * 1024 * 1024
PACKAGED_FILE_BYTE_LIMITS = {
    "manifest.json": MAX_INGESTION_FILE_BYTES["manifest"],
    "players.json": MAX_INGESTION_FILE_BYTES["players"],
    "teams.json": MAX_INGESTION_FILE_BYTES["teams"],
    "events.json": MAX_INGESTION_FILE_BYTES["events"],
    "fixtures.json": MAX_INGESTION_FILE_BYTES["fixtures"],
    HISTORY_FILENAME: MAX_HISTORY_FILE_BYTES,
}

OFFICIAL_SOURCE_URLS = {
    "bootstrap-static": "https://fantasy.premierleague.com/api/bootstrap-static/",
    "fixtures": "https://fantasy.premierleague.com/api/fixtures/",
}
OFFICIAL_HISTORY_SOURCE = {
    "name": "element-summary",
    "urlTemplate": "https://fantasy.premierleague.com/api/element-summary/{player_id}/",
}

DEFAULT_INPUT_DIR = REPO_ROOT / "data" / "fpl" / "latest"
DEFAULT_HISTORY_FILE = REPO_ROOT / "data" / "fpl" / "history" / HISTORY_FILENAME
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data" / "databricks" / "public_fpl_snapshot"

JsonObject = dict[str, Any]


def package_public_fpl_snapshot(
    input_dir: str | Path,
    history_file: str | Path,
    output_dir: str | Path,
    *,
    test_fixture: bool = False,
    fixture_player_limit: int = 8,
    fixture_gameweek_limit: int = 8,
) -> JsonObject:
    """Create the public snapshot package and return its metadata."""

    source_dir = Path(input_dir)
    source_history_file = Path(history_file)
    destination = Path(output_dir)
    _protect_source_paths(source_dir, source_history_file, destination)

    parent_files = {
        filename: source_dir / filename
        for filename in NORMALIZED_FILENAMES
    }
    parent_files[HISTORY_FILENAME] = source_history_file

    staging_dir = _create_staging_dir(destination)
    try:
        # Capture each source file exactly once, then bind validation, canonical
        # hashing, packaging, and per-file hashing to those staged bytes. A
        # concurrently replaced source cannot be attributed to different bytes.
        for filename, source_file in parent_files.items():
            _copy_bounded_regular_file(
                source_file,
                staging_dir / filename,
                filename,
                PACKAGED_FILE_BYTE_LIMITS[filename],
            )

        dataset = read_ingestion_dataset(staging_dir)
        history = _read_json_object(
            staging_dir / HISTORY_FILENAME,
            HISTORY_FILENAME,
            MAX_HISTORY_FILE_BYTES,
        )
        _validate_official_public_sources(dataset, history)
        _validate_history(dataset, history)
        parent_canonical_hash = dataset_snapshot_hash(dataset)
        parent_file_hashes = {
            filename: _sha256_file(staging_dir / filename)
            for filename in PACKAGED_FILENAMES
        }

        fixture_details: JsonObject | None = None
        packaged_dataset = dataset
        packaged_history = history
        if test_fixture:
            packaged_dataset, packaged_history, fixture_details = _derive_test_fixture(
                dataset,
                history,
                player_limit=fixture_player_limit,
                gameweek_limit=fixture_gameweek_limit,
            )
            _validate_history(packaged_dataset, packaged_history)
            _write_dataset(staging_dir, packaged_dataset)
            _write_json(staging_dir / HISTORY_FILENAME, packaged_history)

        metadata = _build_metadata(
            staging_dir,
            packaged_dataset,
            packaged_history,
            test_fixture=test_fixture,
            fixture_details=fixture_details,
            parent_canonical_hash=parent_canonical_hash,
            parent_dataset=dataset,
            parent_history=history,
            parent_file_hashes=parent_file_hashes,
        )
        _write_json(staging_dir / METADATA_FILENAME, metadata)
        _replace_generated_output(staging_dir, destination)
    except Exception:
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise

    return metadata


def _build_metadata(
    package_dir: Path,
    dataset: Dataset,
    history: JsonObject,
    *,
    test_fixture: bool,
    fixture_details: JsonObject | None,
    parent_canonical_hash: str,
    parent_dataset: Dataset,
    parent_history: JsonObject,
    parent_file_hashes: dict[str, str],
) -> JsonObject:
    manifest = _require_object(dataset.get("manifest"), "manifest")
    effective_season, season_source = _effective_season(manifest, dataset["events"])
    sources = _sanitized_sources(manifest, history)
    capture_timestamps = [
        _require_string(manifest.get("generatedAt"), "manifest.generatedAt"),
        _require_string(history.get("generatedAt"), "history.generatedAt"),
        *[
            _require_string(source.get("fetchedAt"), "source.fetchedAt")
            for source in sources
        ],
    ]

    record_counts = dict(_require_object(manifest.get("recordCounts"), "manifest.recordCounts"))
    record_counts["historyRows"] = _require_int(history.get("rowCount"), "history.rowCount")
    file_record_counts = {
        "manifest.json": 1,
        "players.json": record_counts["players"],
        "teams.json": record_counts["teams"],
        "events.json": record_counts["events"],
        "fixtures.json": record_counts["fixtures"],
        HISTORY_FILENAME: record_counts["historyRows"],
    }
    file_roles = {
        "manifest.json": "normalized-ingestion-manifest",
        "players.json": "normalized-players",
        "teams.json": "normalized-teams",
        "events.json": "normalized-gameweeks",
        "fixtures.json": "normalized-fixtures",
        HISTORY_FILENAME: "official-player-gameweek-history",
    }
    files = [
        {
            "filename": filename,
            "contentRole": file_roles[filename],
            "recordCount": file_record_counts[filename],
            "bytes": (package_dir / filename).stat().st_size,
            "sha256": _sha256_file(package_dir / filename),
        }
        for filename in PACKAGED_FILENAMES
    ]

    captured_at = _latest_timestamp(capture_timestamps)
    canonical_snapshot_hash = dataset_snapshot_hash(dataset)
    file_sha256 = {
        file_metadata["filename"]: file_metadata["sha256"]
        for file_metadata in files
    }
    fixture_description = (
        "Deterministic subset of real public FPL data; fixture counts and metrics are not full-dataset evidence"
        if test_fixture
        else None
    )
    metadata: JsonObject = {
        "schemaVersion": 1,
        "datasetType": "public-fpl",
        "preparedAt": captured_at,
        "sourceSnapshotHash": canonical_snapshot_hash,
        "historyCaptureHash": file_sha256[HISTORY_FILENAME],
        "sourceGeneratedAt": manifest["generatedAt"],
        "historyGeneratedAt": history["generatedAt"],
        "fixtureDescription": fixture_description,
        "snapshotType": (
            "deterministic-public-fpl-test-fixture"
            if test_fixture
            else "public-fpl-snapshot"
        ),
        "dataClassification": "public",
        "isTestFixture": test_fixture,
        "isSubset": test_fixture,
        "effectiveSeason": effective_season,
        "seasonSource": season_source,
        "capturedAt": captured_at,
        "captureTimestamps": {
            "normalizedSnapshotGeneratedAt": manifest["generatedAt"],
            "playerHistoryGeneratedAt": history["generatedAt"],
        },
        "canonicalSnapshotHash": canonical_snapshot_hash,
        "hashAlgorithm": "SHA-256",
        "recordCounts": record_counts,
        "fileSha256": file_sha256,
        "sources": sources,
        "files": files,
        "provenance": {
            "normalizedSnapshotSchemaVersion": manifest["schemaVersion"],
            "playerHistorySchemaVersion": history["schemaVersion"],
            "historyInputSnapshotGeneratedAt": history["inputSnapshotGeneratedAt"],
            "derivedOnlyFromOfficialPublicFplData": True,
            "localPathsIncluded": False,
        },
    }

    if test_fixture:
        if fixture_details is None:
            raise ValueError("Test-fixture metadata is missing selection details")
        parent_manifest = _require_object(parent_dataset.get("manifest"), "parent manifest")
        parent_counts = dict(_require_object(parent_manifest.get("recordCounts"), "parent recordCounts"))
        parent_counts["historyRows"] = _require_int(
            parent_history.get("rowCount"),
            "parent history.rowCount",
        )
        metadata["fixture"] = {
            "label": "Deterministic subset of a real public FPL snapshot",
            "intendedUse": "Automated tests and Databricks demonstrations only",
            "metricsQualification": "Fixture counts and metrics are not full historical-dataset evidence",
            "selection": fixture_details,
            "parent": {
                "canonicalSnapshotHash": parent_canonical_hash,
                "recordCounts": parent_counts,
                "fileSha256": parent_file_hashes,
            },
        }

    return metadata


def _derive_test_fixture(
    dataset: Dataset,
    history: JsonObject,
    *,
    player_limit: int,
    gameweek_limit: int,
) -> tuple[Dataset, JsonObject, JsonObject]:
    if player_limit <= 0:
        raise ValueError("fixture_player_limit must be positive")
    if gameweek_limit <= 0:
        raise ValueError("fixture_gameweek_limit must be positive")

    raw_history_rows = _require_list(history.get("rows"), "history.rows")
    history_rows = [
        _require_object(row, "history.rows[]")
        for row in raw_history_rows
        if _require_int(_require_object(row, "history.rows[]").get("gameweekId"), "gameweekId")
        <= gameweek_limit
    ]
    players = sorted(
        [_require_object(player, "players[]") for player in dataset["players"]],
        key=lambda player: _require_int(player.get("id"), "player.id"),
    )
    history_player_ids = {
        _require_int(row.get("playerId"), "history.playerId")
        for row in history_rows
    }
    eligible_players = [
        player
        for player in players
        if _require_int(player.get("id"), "player.id") in history_player_ids
    ]
    selected_players = _select_position_balanced_players(eligible_players, player_limit)
    if len(selected_players) != player_limit:
        raise ValueError(
            f"Could select only {len(selected_players)} fixture players from requested {player_limit}"
        )

    selected_player_ids = {
        _require_int(player.get("id"), "player.id")
        for player in selected_players
    }
    selected_history_rows = sorted(
        [row for row in history_rows if _require_int(row.get("playerId"), "history.playerId") in selected_player_ids],
        key=lambda row: (
            _require_int(row.get("playerId"), "history.playerId"),
            _require_int(row.get("gameweekId"), "history.gameweekId"),
            _require_int(row.get("fixtureId"), "history.fixtureId"),
        ),
    )
    selected_fixture_ids = {
        _require_int(row.get("fixtureId"), "history.fixtureId")
        for row in selected_history_rows
    }
    fixtures = sorted(
        [
            _require_object(fixture, "fixtures[]")
            for fixture in dataset["fixtures"]
            if _require_int(_require_object(fixture, "fixtures[]").get("id"), "fixture.id")
            in selected_fixture_ids
        ],
        key=lambda fixture: _require_int(fixture.get("id"), "fixture.id"),
    )
    if len(fixtures) != len(selected_fixture_ids):
        raise ValueError("The requested fixture subset references missing fixture records")

    selected_event_ids = {
        _require_int(fixture.get("eventId"), "fixture.eventId")
        for fixture in fixtures
    }
    events = sorted(
        [
            _require_object(event, "events[]")
            for event in dataset["events"]
            if _require_int(_require_object(event, "events[]").get("id"), "event.id")
            in selected_event_ids
        ],
        key=lambda event: _require_int(event.get("id"), "event.id"),
    )
    selected_team_ids = {
        *[_require_int(player.get("teamId"), "player.teamId") for player in selected_players],
        *[_require_int(fixture.get("teamHId"), "fixture.teamHId") for fixture in fixtures],
        *[_require_int(fixture.get("teamAId"), "fixture.teamAId") for fixture in fixtures],
        *[_require_int(row.get("opponentTeamId"), "history.opponentTeamId") for row in selected_history_rows],
    }
    teams = sorted(
        [
            _require_object(team, "teams[]")
            for team in dataset["teams"]
            if _require_int(_require_object(team, "teams[]").get("id"), "team.id")
            in selected_team_ids
        ],
        key=lambda team: _require_int(team.get("id"), "team.id"),
    )
    if len(teams) != len(selected_team_ids):
        raise ValueError("The requested fixture subset references missing team records")

    original_manifest = _require_object(dataset.get("manifest"), "manifest")
    manifest = dict(original_manifest)
    manifest["currentEventId"] = (
        original_manifest.get("currentEventId")
        if original_manifest.get("currentEventId") in selected_event_ids
        else None
    )
    manifest["recordCounts"] = {
        "players": len(selected_players),
        "teams": len(teams),
        "events": len(events),
        "fixtures": len(fixtures),
    }
    fixture_dataset = validate_ingestion_dataset(
        {
            "manifest": manifest,
            "players": selected_players,
            "teams": teams,
            "events": events,
            "fixtures": fixtures,
        }
    )
    fixture_history = {
        **history,
        "playerCount": len(selected_players),
        "rowCount": len(selected_history_rows),
        "rows": selected_history_rows,
    }
    selection = {
        "strategy": "position-balanced, team-diverse players ordered by public source id",
        "maximumGameweekId": gameweek_limit,
        "requestedPlayerCount": player_limit,
        "selectedPlayerIds": sorted(selected_player_ids),
        "selectedGameweekIds": sorted(selected_event_ids),
    }
    return fixture_dataset, fixture_history, selection


def _select_position_balanced_players(players: list[JsonObject], limit: int) -> list[JsonObject]:
    selected: list[JsonObject] = []
    selected_ids: set[int] = set()
    selected_team_ids: set[int] = set()
    players_by_position = {
        position: [player for player in players if player.get("position") == position]
        for position in POSITION_ORDER
    }

    while len(selected) < limit:
        selected_this_round = 0
        for position in POSITION_ORDER:
            if len(selected) >= limit:
                break
            candidates = [
                player
                for player in players_by_position[position]
                if _require_int(player.get("id"), "player.id") not in selected_ids
            ]
            if not candidates:
                continue
            team_diverse_candidates = [
                player
                for player in candidates
                if _require_int(player.get("teamId"), "player.teamId") not in selected_team_ids
            ]
            selected_player = (team_diverse_candidates or candidates)[0]
            selected.append(selected_player)
            selected_ids.add(_require_int(selected_player.get("id"), "player.id"))
            selected_team_ids.add(_require_int(selected_player.get("teamId"), "player.teamId"))
            selected_this_round += 1
        if selected_this_round == 0:
            break

    return sorted(selected, key=lambda player: _require_int(player.get("id"), "player.id"))


def _validate_official_public_sources(dataset: Dataset, history: JsonObject) -> None:
    manifest = _require_object(dataset.get("manifest"), "manifest")
    sources = _require_list(manifest.get("sources"), "manifest.sources")
    if len(sources) != len(OFFICIAL_SOURCE_URLS):
        raise ValueError("Normalized snapshot must contain exactly the official public FPL sources")
    seen_sources: dict[str, str] = {}
    for raw_source in sources:
        source = _require_object(raw_source, "manifest.sources[]")
        name = _require_string(source.get("name"), "source.name")
        url = _require_string(source.get("url"), "source.url")
        if name in seen_sources:
            raise ValueError(f"Normalized snapshot contains duplicate source metadata for {name}")
        seen_sources[name] = url
    if seen_sources != OFFICIAL_SOURCE_URLS:
        raise ValueError("Normalized snapshot sources must be the official public FPL bootstrap and fixtures APIs")

    history_source = _require_object(history.get("source"), "history.source")
    actual_history_source = {
        "name": _require_string(history_source.get("name"), "history.source.name"),
        "urlTemplate": _require_string(history_source.get("urlTemplate"), "history.source.urlTemplate"),
    }
    if actual_history_source != OFFICIAL_HISTORY_SOURCE:
        raise ValueError("Player history source must be the official public FPL element-summary API")


def _validate_history(dataset: Dataset, history: JsonObject) -> None:
    manifest = _require_object(dataset.get("manifest"), "manifest")
    players = [_require_object(player, "players[]") for player in dataset["players"]]
    teams = [_require_object(team, "teams[]") for team in dataset["teams"]]
    events = [_require_object(event, "events[]") for event in dataset["events"]]
    fixtures = [_require_object(fixture, "fixtures[]") for fixture in dataset["fixtures"]]
    rows = [_require_object(row, "history.rows[]") for row in _require_list(history.get("rows"), "history.rows")]

    if history.get("schemaVersion") != 1:
        raise ValueError("Player history schemaVersion must be 1")
    if history.get("inputSnapshotGeneratedAt") != manifest.get("generatedAt"):
        raise ValueError("Player history does not reference the normalized snapshot generatedAt timestamp")
    if history.get("inputSeason") != manifest.get("season"):
        raise ValueError("Player history inputSeason does not match the normalized manifest season")
    if _require_int(history.get("playerCount"), "history.playerCount") != len(players):
        raise ValueError("Player history playerCount does not match players.json")
    if _require_int(history.get("rowCount"), "history.rowCount") != len(rows):
        raise ValueError("Player history rowCount does not match history.rows")

    player_ids = {_require_int(player.get("id"), "player.id") for player in players}
    team_ids = {_require_int(team.get("id"), "team.id") for team in teams}
    event_ids = {_require_int(event.get("id"), "event.id") for event in events}
    fixtures_by_id = {
        _require_int(fixture.get("id"), "fixture.id"): fixture
        for fixture in fixtures
    }
    seen_history_keys: set[tuple[int, int]] = set()
    for row in rows:
        player_id = _require_int(row.get("playerId"), "history.playerId")
        fixture_id = _require_int(row.get("fixtureId"), "history.fixtureId")
        gameweek_id = _require_int(row.get("gameweekId"), "history.gameweekId")
        opponent_team_id = _require_int(row.get("opponentTeamId"), "history.opponentTeamId")
        was_home = row.get("wasHome")
        if player_id not in player_ids:
            raise ValueError(f"History row references unknown player {player_id}")
        if gameweek_id not in event_ids:
            raise ValueError(f"History row references unknown gameweek {gameweek_id}")
        if opponent_team_id not in team_ids:
            raise ValueError(f"History row references unknown opponent team {opponent_team_id}")
        fixture = fixtures_by_id.get(fixture_id)
        if fixture is None:
            raise ValueError(f"History row references unknown fixture {fixture_id}")
        if fixture.get("eventId") != gameweek_id:
            raise ValueError(f"History row gameweek does not match fixture {fixture_id}")
        if not isinstance(was_home, bool):
            raise ValueError("history.wasHome must be a boolean")
        expected_opponent = fixture.get("teamAId") if was_home else fixture.get("teamHId")
        if expected_opponent != opponent_team_id:
            raise ValueError(f"History row opponent does not match fixture {fixture_id}")
        history_key = (player_id, fixture_id)
        if history_key in seen_history_keys:
            raise ValueError(f"Duplicate history row for player {player_id}, fixture {fixture_id}")
        seen_history_keys.add(history_key)


def _effective_season(manifest: JsonObject, raw_events: Any) -> tuple[str, str]:
    manifest_season = manifest.get("season")
    if isinstance(manifest_season, str) and manifest_season.strip():
        return manifest_season.strip(), "manifest.season"
    if manifest_season is not None:
        raise ValueError("manifest.season must be a non-empty string or null")

    events = [_require_object(event, "events[]") for event in _require_list(raw_events, "events")]
    if not events:
        raise ValueError("Cannot derive a season from an empty events file")
    deadlines = [
        _parse_timestamp(_require_string(event.get("deadlineTime"), "event.deadlineTime"))
        for event in events
    ]
    start = min(deadlines)
    end = max(deadlines)
    start_year = start.year
    end_year = end.year
    if end_year == start_year and start.month >= 6:
        end_year += 1
    if end_year not in {start_year, start_year + 1}:
        raise ValueError("Event deadlines do not describe a single FPL season")
    return f"{start_year}-{end_year % 100:02d}", "derived-from-event-deadlines"


def _sanitized_sources(manifest: JsonObject, history: JsonObject) -> list[JsonObject]:
    sources = []
    for raw_source in _require_list(manifest.get("sources"), "manifest.sources"):
        source = _require_object(raw_source, "manifest.sources[]")
        sources.append(
            {
                "name": _require_string(source.get("name"), "source.name"),
                "url": _require_string(source.get("url"), "source.url"),
                "fetchedAt": _require_string(source.get("fetchedAt"), "source.fetchedAt"),
            }
        )
    history_source = _require_object(history.get("source"), "history.source")
    sources.append(
        {
            "name": _require_string(history_source.get("name"), "history.source.name"),
            "url": _require_string(history_source.get("urlTemplate"), "history.source.urlTemplate"),
            "fetchedAt": _require_string(history_source.get("fetchedAt"), "history.source.fetchedAt"),
        }
    )
    return sources


def _latest_timestamp(values: Sequence[str]) -> str:
    if not values:
        raise ValueError("At least one capture timestamp is required")
    latest_value, _ = max(
        ((value, _parse_timestamp(value)) for value in values),
        key=lambda item: item[1],
    )
    return latest_value


def _parse_timestamp(value: str) -> datetime:
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        timestamp = datetime.fromisoformat(normalized)
    except ValueError as error:
        raise ValueError(f"Invalid ISO-8601 timestamp: {value}") from error
    if timestamp.tzinfo is None:
        raise ValueError(f"Timestamp must include a UTC offset: {value}")
    return timestamp


def _write_dataset(output_dir: Path, dataset: Dataset) -> None:
    for key, filename in (
        ("manifest", "manifest.json"),
        ("players", "players.json"),
        ("teams", "teams.json"),
        ("events", "events.json"),
        ("fixtures", "fixtures.json"),
    ):
        _write_json(output_dir / filename, dataset[key])


def _write_json(file_path: Path, value: Any) -> None:
    file_path.write_text(
        f"{json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)}\n",
        encoding="utf-8",
    )


def _read_json_object(file_path: Path, label: str, max_bytes: int) -> JsonObject:
    value = read_bounded_json_file(file_path, label, max_bytes)
    return _require_object(value, label)


def _copy_bounded_regular_file(
    source_file: Path,
    destination_file: Path,
    filename: str,
    max_bytes: int,
) -> None:
    try:
        initial_stats = source_file.lstat()
    except FileNotFoundError:
        raise FileNotFoundError(f"Missing ingestion file: {filename}") from None
    except OSError:
        raise ValueError(f"Unable to inspect ingestion file: {filename}") from None

    if not stat.S_ISREG(initial_stats.st_mode):
        raise ValueError(f"Ingestion input must be a regular non-symlink file: {filename}")
    if initial_stats.st_size > max_bytes:
        raise ValueError(f"Ingestion input exceeds its byte limit: {filename}")

    open_flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(source_file, open_flags)
    except OSError:
        raise ValueError(f"Unable to open ingestion input safely: {filename}") from None

    copied_bytes = 0
    opened_stats = None
    final_stats = None
    try:
        with os.fdopen(descriptor, "rb") as source, destination_file.open("xb") as destination:
            opened_stats = os.fstat(source.fileno())
            if (
                not stat.S_ISREG(opened_stats.st_mode)
                or (initial_stats.st_dev, initial_stats.st_ino) != (opened_stats.st_dev, opened_stats.st_ino)
                or opened_stats.st_size > max_bytes
            ):
                raise ValueError(f"Ingestion input changed or exceeded its byte limit: {filename}")

            while chunk := source.read(min(1024 * 1024, max_bytes - copied_bytes + 1)):
                copied_bytes += len(chunk)
                if copied_bytes > max_bytes:
                    raise ValueError(f"Ingestion input exceeds its byte limit: {filename}")
                destination.write(chunk)
            final_stats = os.fstat(source.fileno())
    except ValueError:
        destination_file.unlink(missing_ok=True)
        raise
    except OSError:
        destination_file.unlink(missing_ok=True)
        raise ValueError(f"Unable to capture ingestion input safely: {filename}") from None

    if opened_stats is None or final_stats is None:  # pragma: no cover - defensive invariant.
        destination_file.unlink(missing_ok=True)
        raise RuntimeError("Bounded file capture did not record source metadata")
    if (
        final_stats.st_size > max_bytes
        or copied_bytes != final_stats.st_size
        or (opened_stats.st_size, opened_stats.st_mtime_ns) != (final_stats.st_size, final_stats.st_mtime_ns)
    ):
        destination_file.unlink(missing_ok=True)
        raise ValueError(f"Ingestion input changed or exceeded its byte limit: {filename}")


def _sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _create_staging_dir(destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix=f".{destination.name}.", dir=destination.parent))


def _replace_generated_output(staging_dir: Path, destination: Path) -> None:
    if destination.exists():
        if not destination.is_dir():
            raise ValueError(f"Snapshot output exists and is not a directory: {destination}")
        unexpected = sorted(entry.name for entry in destination.iterdir() if entry.name not in OUTPUT_FILENAMES)
        if unexpected:
            raise ValueError(
                "Refusing to replace snapshot output containing unexpected entries: "
                + ", ".join(unexpected)
            )
        shutil.rmtree(destination)
    staging_dir.replace(destination)


def _protect_source_paths(source_dir: Path, history_file: Path, destination: Path) -> None:
    source_resolved = source_dir.resolve()
    history_resolved = history_file.resolve()
    destination_resolved = destination.resolve()
    if source_resolved == destination_resolved:
        raise ValueError("Snapshot output must not overwrite the normalized source directory")
    if history_resolved == destination_resolved or destination_resolved in history_resolved.parents:
        raise ValueError("Snapshot output must not contain or overwrite the source history file")
    if destination_resolved in source_resolved.parents:
        raise ValueError("Snapshot output must not contain the normalized source directory")


def _require_object(value: Any, label: str) -> JsonObject:
    if not isinstance(value, dict):
        raise ValueError(f"Expected {label} to be a JSON object")
    return value


def _require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"Expected {label} to be a JSON array")
    return value


def _require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"Expected {label} to be a non-empty string")
    return value


def _require_int(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"Expected {label} to be an integer")
    return value


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--history-file", type=Path, default=DEFAULT_HISTORY_FILE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument(
        "--test-fixture",
        action="store_true",
        help="Write a small deterministic subset and label it as a test fixture",
    )
    parser.add_argument("--fixture-player-limit", type=int, default=8)
    parser.add_argument("--fixture-gameweek-limit", type=int, default=8)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    metadata = package_public_fpl_snapshot(
        args.input_dir,
        args.history_file,
        args.output_dir,
        test_fixture=args.test_fixture,
        fixture_player_limit=args.fixture_player_limit,
        fixture_gameweek_limit=args.fixture_gameweek_limit,
    )
    print(
        json.dumps(
            {
                "canonicalSnapshotHash": metadata["canonicalSnapshotHash"],
                "effectiveSeason": metadata["effectiveSeason"],
                "isTestFixture": metadata["isTestFixture"],
                "recordCounts": metadata["recordCounts"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
