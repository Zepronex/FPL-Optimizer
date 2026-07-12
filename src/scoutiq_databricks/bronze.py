from __future__ import annotations

import argparse
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
        get_spark,
        merge_delta_table,
        print_task_summary,
        table_counts,
    )


def read_public_snapshot(spark: SparkSession, input_path: str) -> dict[str, DataFrame]:
    base = input_path.rstrip("/")
    return {
        "snapshot_metadata": _read_single_object(spark, f"{base}/snapshot_metadata.json", SNAPSHOT_METADATA_SCHEMA),
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
    }


def validate_public_snapshot(snapshot: dict[str, DataFrame]) -> None:
    metadata = snapshot["snapshot_metadata"]
    manifest = snapshot["manifest"]
    history_file = snapshot["history_file"]

    for name in ("snapshot_metadata", "manifest", "history_file"):
        count = snapshot[name].count()
        if count != 1:
            raise ValueError(f"{name} must contain exactly one object, received {count}")

    actual_counts = {
        "players": snapshot["players"].count(),
        "teams": snapshot["teams"].count(),
        "events": snapshot["gameweeks"].count(),
        "fixtures": snapshot["fixtures"].count(),
    }
    expected = manifest.select("recordCounts.*").first().asDict()
    if actual_counts != expected:
        raise ValueError(f"Manifest record counts do not match uploaded files: {expected} != {actual_counts}")

    metadata_row = metadata.select(
        "datasetType",
        "sourceSnapshotHash",
        "historyCaptureHash",
        "sourceGeneratedAt",
        "historyGeneratedAt",
        "recordCounts",
    ).first()
    if metadata_row.datasetType != "public-fpl":
        raise ValueError(f"Unsupported snapshot datasetType: {metadata_row.datasetType!r}")
    if not metadata_row.sourceSnapshotHash or not metadata_row.historyCaptureHash:
        raise ValueError("Snapshot hashes must be present")

    source_generated_at = manifest.select("generatedAt").first()[0]
    history = history_file.select(
        "generatedAt", "inputSnapshotGeneratedAt", "playerCount", "rowCount", F.size("rows").alias("actualRowCount")
    ).first()
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

    fail_on_invalid_ids(snapshot["players"], ("id", "teamId"), "players input")
    fail_on_invalid_ids(snapshot["teams"], ("id",), "teams input")
    fail_on_invalid_ids(snapshot["gameweeks"], ("id",), "gameweeks input")
    fail_on_invalid_ids(snapshot["fixtures"], ("id", "teamHId", "teamAId"), "fixtures input")


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
