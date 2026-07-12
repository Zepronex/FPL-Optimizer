from __future__ import annotations

import argparse
import re
from collections.abc import Sequence

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

try:
    from scoutiq_databricks import PIPELINE_NAME
    from scoutiq_databricks.common import (
        BRONZE_TABLE_KEYS,
        FIXTURE_SCHEMA,
        GAMEWEEK_SCHEMA,
        HISTORY_FILE_SCHEMA,
        MANIFEST_SCHEMA,
        PLAYER_SCHEMA,
        SNAPSHOT_METADATA_SCHEMA,
        SOURCE_SCHEMA,
        TEAM_SCHEMA,
        add_common_task_arguments,
        fail_on_invalid_ids,
        fail_on_invalid_numeric_bounds,
        fail_on_rows,
        get_spark,
        merge_delta_table,
        print_task_summary,
        table_counts,
    )
except ModuleNotFoundError:  # Python-file tasks execute this file outside package mode.
    import sys
    from pathlib import Path

    source_file = globals().get("__file__") or globals().get("filename")
    if not source_file:
        raise RuntimeError("Unable to resolve the ScoutIQ source root for this Python-file task")
    sys.path.insert(0, str(Path(str(source_file)).resolve().parents[1]))
    from scoutiq_databricks import PIPELINE_NAME
    from scoutiq_databricks.common import (
        BRONZE_TABLE_KEYS,
        FIXTURE_SCHEMA,
        GAMEWEEK_SCHEMA,
        HISTORY_FILE_SCHEMA,
        MANIFEST_SCHEMA,
        PLAYER_SCHEMA,
        SNAPSHOT_METADATA_SCHEMA,
        SOURCE_SCHEMA,
        TEAM_SCHEMA,
        add_common_task_arguments,
        fail_on_invalid_ids,
        fail_on_invalid_numeric_bounds,
        fail_on_rows,
        get_spark,
        merge_delta_table,
        print_task_summary,
        table_counts,
    )


SNAPSHOT_FILENAMES = (
    "manifest.json",
    "players.json",
    "teams.json",
    "events.json",
    "fixtures.json",
    "player_gameweek_history.json",
)
SNAPSHOT_METADATA_FILENAME = "snapshot_metadata.json"
PACKAGE_FILE_BYTE_LIMITS = {
    SNAPSHOT_METADATA_FILENAME: 256 * 1024,
    "manifest.json": 256 * 1024,
    "players.json": 8 * 1024 * 1024,
    "teams.json": 512 * 1024,
    "events.json": 512 * 1024,
    "fixtures.json": 8 * 1024 * 1024,
    "player_gameweek_history.json": 32 * 1024 * 1024,
}
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
MAX_DATABASE_ID = 2_147_483_647
MAX_GAMEWEEK_ID = 38
MAX_RECORD_COUNTS = {
    "players": 2_000,
    "teams": 100,
    "events": 100,
    "fixtures": 5_000,
}
MAX_HISTORY_ROWS = 400_000


def read_public_snapshot(spark: SparkSession, input_path: str) -> dict[str, DataFrame]:
    base = input_path.rstrip("/")
    file_integrity = _read_file_integrity(spark, base)
    return {
        "snapshot_metadata": _read_single_object(
            spark,
            f"{base}/{SNAPSHOT_METADATA_FILENAME}",
            SNAPSHOT_METADATA_SCHEMA,
        ),
        "manifest": _read_single_object(spark, f"{base}/manifest.json", MANIFEST_SCHEMA),
        "players": _read_array(spark, f"{base}/players.json", PLAYER_SCHEMA),
        "teams": _read_array(spark, f"{base}/teams.json", TEAM_SCHEMA),
        "gameweeks": _read_array(spark, f"{base}/events.json", GAMEWEEK_SCHEMA),
        "fixtures": _read_array(spark, f"{base}/fixtures.json", FIXTURE_SCHEMA),
        "history_file": _read_single_object(
            spark,
            f"{base}/player_gameweek_history.json",
            HISTORY_FILE_SCHEMA,
        ),
        "_file_integrity": file_integrity,
    }


def validate_public_snapshot(snapshot: dict[str, DataFrame]) -> None:
    metadata = snapshot["snapshot_metadata"]
    manifest = snapshot["manifest"]
    history_file = snapshot["history_file"]

    for name in ("snapshot_metadata", "manifest", "history_file"):
        count = snapshot[name].count()
        if count != 1:
            raise ValueError(f"{name} must contain exactly one object, received {count}")

    _validate_file_integrity(metadata, snapshot["_file_integrity"])

    actual_counts = {
        "players": snapshot["players"].count(),
        "teams": snapshot["teams"].count(),
        "events": snapshot["gameweeks"].count(),
        "fixtures": snapshot["fixtures"].count(),
    }
    if any(actual_counts[name] > maximum for name, maximum in MAX_RECORD_COUNTS.items()):
        raise ValueError("Snapshot contains an oversized normalized collection")
    expected = manifest.select("recordCounts.*").first().asDict()
    if actual_counts != expected:
        raise ValueError(f"Manifest record counts do not match uploaded files: {expected} != {actual_counts}")

    metadata_row = metadata.select(
        "schemaVersion",
        "datasetType",
        "sourceSnapshotHash",
        "canonicalSnapshotHash",
        "historyCaptureHash",
        "hashAlgorithm",
        "sourceGeneratedAt",
        "historyGeneratedAt",
        "recordCounts",
    ).first()
    if metadata_row.schemaVersion != 1:
        raise ValueError("Unsupported snapshot metadata schemaVersion")
    if metadata_row.datasetType != "public-fpl":
        raise ValueError(f"Unsupported snapshot datasetType: {metadata_row.datasetType!r}")
    if metadata_row.hashAlgorithm != "SHA-256":
        raise ValueError("Unsupported snapshot hash algorithm")
    if not _is_sha256(metadata_row.sourceSnapshotHash) or not _is_sha256(metadata_row.historyCaptureHash):
        raise ValueError("Snapshot hashes must be valid SHA-256 digests")
    if metadata_row.canonicalSnapshotHash != metadata_row.sourceSnapshotHash:
        raise ValueError("Snapshot canonical hash does not match sourceSnapshotHash")

    source_generated_at = manifest.select("generatedAt").first()[0]
    history = history_file.select(
        "generatedAt", "inputSnapshotGeneratedAt", "playerCount", "rowCount", F.size("rows").alias("actualRowCount")
    ).first()
    if (
        history.generatedAt is None
        or history.inputSnapshotGeneratedAt is None
        or history.playerCount is None
        or history.rowCount is None
        or history.actualRowCount is None
        or history.playerCount < 0
        or history.playerCount > MAX_RECORD_COUNTS["players"]
        or history.rowCount < 0
        or history.rowCount > MAX_HISTORY_ROWS
    ):
        raise ValueError("History file contains invalid required metadata or collection sizes")
    if source_generated_at != metadata_row.sourceGeneratedAt:
        raise ValueError("Snapshot metadata sourceGeneratedAt does not match manifest")
    if history.inputSnapshotGeneratedAt != source_generated_at:
        raise ValueError("History input snapshot timestamp does not match normalized snapshot")
    if history.generatedAt != metadata_row.historyGeneratedAt:
        raise ValueError("Snapshot metadata historyGeneratedAt does not match history file")
    if history.rowCount != history.actualRowCount:
        raise ValueError("History rowCount does not match the uploaded history rows")
    if history.playerCount != actual_counts["players"]:
        raise ValueError("History playerCount does not match normalized players")
    packaged_counts = dict(metadata_row.recordCounts)
    expected_packaged_counts = {**actual_counts, "historyRows": history.rowCount}
    if packaged_counts != expected_packaged_counts:
        raise ValueError(
            f"Snapshot metadata counts do not match uploaded files: {packaged_counts} != {expected_packaged_counts}"
        )

    _validate_snapshot_semantics(snapshot)

    fail_on_invalid_ids(snapshot["players"], ("id", "teamId"), "players input")
    fail_on_invalid_ids(snapshot["teams"], ("id",), "teams input")
    fail_on_invalid_ids(snapshot["gameweeks"], ("id",), "gameweeks input")
    fail_on_invalid_ids(snapshot["fixtures"], ("id", "teamHId", "teamAId"), "fixtures input")


def _validate_snapshot_semantics(snapshot: dict[str, DataFrame]) -> None:
    metadata = snapshot["snapshot_metadata"]
    fail_on_rows(
        metadata,
        F.col("isTestFixture").isNull(),
        "Snapshot metadata contains a malformed isTestFixture flag",
    )

    manifest = snapshot["manifest"]
    fail_on_rows(
        manifest,
        F.col("sources").isNull()
        | (F.size("sources") < 1)
        | (F.size("sources") > 10),
        "Manifest contains an invalid sources collection",
    )

    players = snapshot["players"]
    fail_on_invalid_numeric_bounds(
        players,
        {
            "code": (1, MAX_DATABASE_ID, True),
            "nowCost": (0, 100, False),
            "chanceOfPlayingNextRound": (0, 100, True),
            "chanceOfPlayingThisRound": (0, 100, True),
            "form": (-100, 100, False),
            "selectedByPercent": (0, 100, False),
            "pointsPerGame": (0, 100, False),
            "valueSeason": (0, 1_000, False),
            "totalPoints": (-1_000, 10_000, False),
            "minutes": (0, 10_000, False),
            "starts": (0, 100, False),
            "expectedGoals": (0, 1_000, False),
            "expectedAssists": (0, 1_000, False),
            "expectedGoalInvolvements": (0, 1_000, False),
            "expectedGoalsConceded": (0, 1_000, False),
        },
        "Players input",
    )
    fail_on_rows(
        players,
        F.col("position").isNull()
        | ~F.col("position").isin("GK", "DEF", "MID", "FWD")
        | F.col("displayName").isNull()
        | (F.length("displayName") < 1)
        | (F.length("displayName") > 200)
        | F.col("status").isNull()
        | (F.length("status") < 1)
        | (F.length("status") > 32),
        "Players input contains malformed required text values",
    )

    teams = snapshot["teams"]
    fail_on_invalid_numeric_bounds(
        teams,
        {
            "code": (1, MAX_DATABASE_ID, True),
            "strength": (0, 10_000, True),
            "strengthOverallHome": (0, 10_000, True),
            "strengthOverallAway": (0, 10_000, True),
        },
        "Teams input",
    )

    gameweeks = snapshot["gameweeks"]
    fail_on_invalid_numeric_bounds(
        gameweeks,
        {
            "id": (1, MAX_GAMEWEEK_ID, False),
            "averageEntryScore": (0, 1_000, True),
            "highestScore": (0, 1_000, True),
        },
        "Gameweeks input",
    )
    fail_on_rows(
        gameweeks,
        F.col("finished").isNull()
        | F.col("dataChecked").isNull()
        | F.col("isCurrent").isNull()
        | F.col("isNext").isNull(),
        "Gameweeks input contains malformed required boolean flags",
    )

    fixtures = snapshot["fixtures"]
    fail_on_invalid_numeric_bounds(
        fixtures,
        {
            "code": (1, MAX_DATABASE_ID, True),
            "eventId": (1, MAX_GAMEWEEK_ID, True),
            "teamHScore": (0, 100, True),
            "teamAScore": (0, 100, True),
            "teamHDifficulty": (1, 5, False),
            "teamADifficulty": (1, 5, False),
        },
        "Fixtures input",
    )
    fail_on_rows(
        fixtures,
        F.col("started").isNull() | F.col("finished").isNull(),
        "Fixtures input contains malformed required boolean flags",
    )

    history = snapshot["history_file"].select(F.explode("rows").alias("record")).select("record.*")
    fail_on_invalid_ids(
        history,
        ("playerId", "fixtureId", "gameweekId", "opponentTeamId"),
        "history input",
    )
    fail_on_invalid_numeric_bounds(
        history,
        {
            "gameweekId": (1, MAX_GAMEWEEK_ID, False),
            "opponentTeamId": (1, 100, False),
            "totalPoints": (-20, 100, False),
            "minutes": (0, 180, False),
            "price": (0, 100, False),
            "selected": (0, 100_000_000, False),
        },
        "History input",
    )
    fail_on_rows(
        history,
        F.col("wasHome").isNull(),
        "History input contains a malformed required wasHome flag",
    )


def build_bronze_tables(
    spark: SparkSession,
    input_path: str,
    pipeline_run_id: str,
) -> dict[str, DataFrame]:
    snapshot = read_public_snapshot(spark, input_path)
    validate_public_snapshot(snapshot)

    metadata = snapshot["snapshot_metadata"].select(
        F.col("sourceSnapshotHash").alias("source_snapshot_hash"),
        F.col("historyCaptureHash").alias("history_capture_hash"),
        F.col("effectiveSeason").alias("season"),
        F.to_timestamp("sourceGeneratedAt").alias("source_generated_at"),
        F.to_timestamp("historyGeneratedAt").alias("history_generated_at"),
        F.to_timestamp("preparedAt").alias("snapshot_prepared_at"),
        F.col("datasetType").alias("dataset_type"),
        F.col("isTestFixture").alias("is_test_fixture"),
        F.col("fixtureDescription").alias("fixture_description"),
    )

    manifest = snapshot["manifest"].withColumnRenamed("season", "manifest_season").crossJoin(metadata)
    history_file = snapshot["history_file"].crossJoin(metadata)
    common_values = {
        "pipeline_run_id": F.lit(pipeline_run_id),
        "bronze_ingested_at": F.current_timestamp(),
    }

    ingestion_manifest = manifest.select(
        "source_snapshot_hash",
        "history_capture_hash",
        F.col("schemaVersion").alias("schema_version"),
        "season",
        F.to_timestamp("generatedAt").alias("source_generated_at"),
        "history_generated_at",
        "snapshot_prepared_at",
        F.col("currentEventId").alias("current_event_id"),
        F.to_json("recordCounts").alias("record_counts_json"),
        F.to_json("sources").alias("sources_json"),
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        *common_values.values(),
    ).toDF(
        "source_snapshot_hash",
        "history_capture_hash",
        "schema_version",
        "season",
        "source_generated_at",
        "history_generated_at",
        "snapshot_prepared_at",
        "current_event_id",
        "record_counts_json",
        "sources_json",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        "pipeline_run_id",
        "bronze_ingested_at",
    )

    source_metadata = (
        manifest.select(
            "source_snapshot_hash",
            F.posexplode("sources").alias("source_index", "source"),
            F.lit(pipeline_run_id).alias("pipeline_run_id"),
            F.current_timestamp().alias("bronze_ingested_at"),
        )
        .select(
            "source_snapshot_hash",
            "source_index",
            F.col("source.name").alias("source_name"),
            F.col("source.url").alias("source_url"),
            F.to_timestamp("source.fetchedAt").alias("fetched_at"),
            F.col("source.httpDate").alias("http_date"),
            F.col("source.etag").alias("etag"),
            F.col("source.lastModified").alias("last_modified"),
            "pipeline_run_id",
            "bronze_ingested_at",
        )
    )

    players_raw = _raw_entity_rows(snapshot["players"], metadata, "player", pipeline_run_id)
    teams_raw = _raw_entity_rows(snapshot["teams"], metadata, "team", pipeline_run_id)
    gameweeks_raw = _raw_entity_rows(snapshot["gameweeks"], metadata, "gameweek", pipeline_run_id)
    fixtures_raw = _raw_entity_rows(snapshot["fixtures"], metadata, "fixture", pipeline_run_id)

    history_rows = history_file.select(
        "source_snapshot_hash",
        "history_capture_hash",
        "season",
        "source_generated_at",
        "history_generated_at",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        F.col("source.name").alias("source_name"),
        F.col("source.urlTemplate").alias("source_url_template"),
        F.to_timestamp("source.fetchedAt").alias("source_fetched_at"),
        F.explode("rows").alias("record"),
    )
    history_raw = history_rows.select(
        "source_snapshot_hash",
        "history_capture_hash",
        F.col("record.playerId").alias("player_id"),
        F.col("record.gameweekId").alias("gameweek_id"),
        F.col("record.fixtureId").alias("fixture_id"),
        F.to_json("record", options={"ignoreNullFields": "false"}).alias("raw_record_json"),
        "season",
        "source_generated_at",
        "history_generated_at",
        "source_name",
        "source_url_template",
        "source_fetched_at",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        F.lit(pipeline_run_id).alias("pipeline_run_id"),
        F.current_timestamp().alias("bronze_ingested_at"),
    )
    fail_on_invalid_ids(history_raw, ("player_id", "gameweek_id", "fixture_id"), "history input")

    return {
        "bronze_ingestion_manifest": ingestion_manifest,
        "bronze_source_metadata": source_metadata,
        "bronze_players_raw": players_raw,
        "bronze_teams_raw": teams_raw,
        "bronze_gameweeks_raw": gameweeks_raw,
        "bronze_fixtures_raw": fixtures_raw,
        "bronze_player_gameweek_history_raw": history_raw,
    }


def run(
    spark: SparkSession,
    *,
    catalog: str,
    schema: str,
    input_path: str,
    pipeline_run_id: str,
) -> dict[str, int]:
    tables = build_bronze_tables(spark, input_path, pipeline_run_id)
    for table_name, dataframe in tables.items():
        merge_delta_table(spark, dataframe, catalog, schema, table_name, BRONZE_TABLE_KEYS[table_name])
    counts = table_counts(tables)
    print_task_summary(
        "bronze",
        pipeline_run_id=pipeline_run_id,
        catalog=catalog,
        schema=schema,
        input_path=input_path,
        row_counts=counts,
    )
    return counts


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build ScoutIQ Bronze Delta tables from a public FPL snapshot.")
    add_common_task_arguments(parser, needs_input=True)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    spark = get_spark(f"{PIPELINE_NAME}-bronze")
    run(
        spark,
        catalog=args.catalog,
        schema=args.schema,
        input_path=args.input_path,
        pipeline_run_id=args.pipeline_run_id,
    )
    return 0


def _read_single_object(spark: SparkSession, path: str, schema) -> DataFrame:
    return spark.read.option("multiLine", "true").schema(schema).json(path)


def _read_array(spark: SparkSession, path: str, schema) -> DataFrame:
    return spark.read.option("multiLine", "true").schema(schema).json(path)


def _read_file_integrity(spark: SparkSession, base: str) -> DataFrame:
    integrity = None
    for filename, max_bytes in PACKAGE_FILE_BYTE_LIMITS.items():
        binary_file = spark.read.format("binaryFile").load(f"{base}/{filename}")
        length_rows = binary_file.select("length").collect()
        if (
            len(length_rows) != 1
            or length_rows[0].length is None
            or length_rows[0].length < 0
            or length_rows[0].length > max_bytes
        ):
            raise ValueError(f"Snapshot package file exceeds its byte limit: {filename}")
        if filename not in SNAPSHOT_FILENAMES:
            continue
        file_integrity = (
            binary_file
            .select(
                F.lit(filename).alias("filename"),
                F.sha2("content", 256).alias("sha256"),
            )
        )
        integrity = file_integrity if integrity is None else integrity.unionByName(file_integrity)
    if integrity is None:  # pragma: no cover - SNAPSHOT_FILENAMES is a non-empty constant.
        raise RuntimeError("Snapshot integrity file list is empty")
    return integrity


def _validate_file_integrity(metadata: DataFrame, actual_integrity: DataFrame) -> None:
    metadata_row = metadata.select("fileSha256", "historyCaptureHash").first()
    expected_hashes = dict(metadata_row.fileSha256 or {})
    expected_filenames = set(SNAPSHOT_FILENAMES)
    if set(expected_hashes) != expected_filenames:
        raise ValueError("Snapshot integrity metadata must cover exactly the packaged files")
    if any(not _is_sha256(file_hash) for file_hash in expected_hashes.values()):
        raise ValueError("Snapshot integrity metadata contains an invalid SHA-256 digest")
    if metadata_row.historyCaptureHash != expected_hashes["player_gameweek_history.json"]:
        raise ValueError("Snapshot history hash does not match file integrity metadata")

    integrity_rows = actual_integrity.collect()
    actual_hashes = {row.filename: row.sha256 for row in integrity_rows}
    if len(integrity_rows) != len(actual_hashes) or set(actual_hashes) != expected_filenames:
        raise ValueError("Snapshot integrity check did not read exactly the packaged files")
    if actual_hashes != expected_hashes:
        raise ValueError("Snapshot file integrity check failed")


def _is_sha256(value: object) -> bool:
    return isinstance(value, str) and SHA256_PATTERN.fullmatch(value) is not None


def _raw_entity_rows(
    records: DataFrame,
    metadata: DataFrame,
    record_type: str,
    pipeline_run_id: str,
) -> DataFrame:
    return records.crossJoin(metadata).select(
        "source_snapshot_hash",
        F.col("id").alias("record_id"),
        F.lit(record_type).alias("record_type"),
        F.to_json(F.struct(*records.columns), options={"ignoreNullFields": "false"}).alias("raw_record_json"),
        "season",
        "source_generated_at",
        "history_capture_hash",
        "history_generated_at",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        F.lit(pipeline_run_id).alias("pipeline_run_id"),
        F.current_timestamp().alias("bronze_ingested_at"),
    )


if __name__ == "__main__":
    main()
