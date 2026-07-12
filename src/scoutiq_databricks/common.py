from __future__ import annotations

import argparse
import json
import re
from collections.abc import Iterable, Sequence
from typing import Any

from pyspark.sql import Column, DataFrame, SparkSession, Window
from pyspark.sql import functions as F
from pyspark.sql.types import (
    ArrayType,
    BooleanType,
    DoubleType,
    IntegerType,
    LongType,
    MapType,
    StringType,
    StructField,
    StructType,
)

IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
MAX_DATABASE_ID = 2_147_483_647

BRONZE_TABLE_KEYS: dict[str, tuple[str, ...]] = {
    "bronze_ingestion_manifest": ("source_snapshot_hash",),
    "bronze_source_metadata": ("source_snapshot_hash", "source_index"),
    "bronze_players_raw": ("source_snapshot_hash", "record_id"),
    "bronze_teams_raw": ("source_snapshot_hash", "record_id"),
    "bronze_gameweeks_raw": ("source_snapshot_hash", "record_id"),
    "bronze_fixtures_raw": ("source_snapshot_hash", "record_id"),
    "bronze_player_gameweek_history_raw": (
        "source_snapshot_hash",
        "player_id",
        "gameweek_id",
        "fixture_id",
    ),
}

SILVER_TABLE_KEYS: dict[str, tuple[str, ...]] = {
    "silver_players": ("source_snapshot_hash", "player_id"),
    "silver_teams": ("source_snapshot_hash", "team_id"),
    "silver_gameweeks": ("source_snapshot_hash", "gameweek_id"),
    "silver_fixtures": ("source_snapshot_hash", "fixture_id"),
    "silver_player_gameweek_history": (
        "source_snapshot_hash",
        "player_id",
        "gameweek_id",
        "fixture_id",
    ),
}

GOLD_TABLE_KEYS: dict[str, tuple[str, ...]] = {
    "gold_team_fixture_features": (
        "source_snapshot_hash",
        "gameweek_id",
        "fixture_id",
        "team_id",
    ),
    "gold_current_player_gameweek_features": (
        "source_snapshot_hash",
        "gameweek_id",
        "fixture_id",
        "player_id",
    ),
    "gold_historical_player_gameweek_features": (
        "source_snapshot_hash",
        "season",
        "gameweek_id",
        "player_id",
    ),
    "gold_historical_player_gameweek_outcomes": (
        "source_snapshot_hash",
        "season",
        "gameweek_id",
        "player_id",
    ),
}

EVALUATION_TABLE_KEYS: dict[str, tuple[str, ...]] = {
    "analytics_expected_points_predictions": (
        "evaluation_run_id",
        "season",
        "gameweek_id",
        "player_id",
    ),
    "analytics_expected_points_metrics": (
        "evaluation_run_id",
        "model_variant",
        "segment_type",
        "segment_value",
    ),
    "analytics_pipeline_run_summary": ("pipeline_run_id",),
}


SOURCE_SCHEMA = StructType(
    [
        StructField("name", StringType(), False),
        StructField("url", StringType(), False),
        StructField("fetchedAt", StringType(), False),
        StructField("httpDate", StringType(), True),
        StructField("etag", StringType(), True),
        StructField("lastModified", StringType(), True),
    ]
)

MANIFEST_SCHEMA = StructType(
    [
        StructField("schemaVersion", IntegerType(), False),
        StructField("season", StringType(), True),
        StructField("generatedAt", StringType(), False),
        StructField("currentEventId", IntegerType(), True),
        StructField("sources", ArrayType(SOURCE_SCHEMA, containsNull=False), False),
        StructField(
            "recordCounts",
            StructType(
                [
                    StructField("players", IntegerType(), False),
                    StructField("teams", IntegerType(), False),
                    StructField("events", IntegerType(), False),
                    StructField("fixtures", IntegerType(), False),
                ]
            ),
            False,
        ),
    ]
)

PLAYER_SCHEMA = StructType(
    [
        StructField("id", IntegerType(), True),
        StructField("code", IntegerType(), True),
        StructField("firstName", StringType(), True),
        StructField("secondName", StringType(), True),
        StructField("webName", StringType(), True),
        StructField("displayName", StringType(), True),
        StructField("teamId", IntegerType(), True),
        StructField("position", StringType(), True),
        StructField("nowCost", DoubleType(), True),
        StructField("status", StringType(), True),
        StructField("chanceOfPlayingNextRound", IntegerType(), True),
        StructField("chanceOfPlayingThisRound", IntegerType(), True),
        StructField("form", DoubleType(), True),
        StructField("selectedByPercent", DoubleType(), True),
        StructField("pointsPerGame", DoubleType(), True),
        StructField("valueSeason", DoubleType(), True),
        StructField("totalPoints", IntegerType(), True),
        StructField("minutes", IntegerType(), True),
        StructField("starts", IntegerType(), True),
        StructField("expectedGoals", DoubleType(), True),
        StructField("expectedAssists", DoubleType(), True),
        StructField("expectedGoalInvolvements", DoubleType(), True),
        StructField("expectedGoalsConceded", DoubleType(), True),
    ]
)

TEAM_SCHEMA = StructType(
    [
        StructField("id", IntegerType(), True),
        StructField("code", IntegerType(), True),
        StructField("name", StringType(), True),
        StructField("shortName", StringType(), True),
        StructField("strength", IntegerType(), True),
        StructField("strengthOverallHome", IntegerType(), True),
        StructField("strengthOverallAway", IntegerType(), True),
    ]
)

GAMEWEEK_SCHEMA = StructType(
    [
        StructField("id", IntegerType(), True),
        StructField("name", StringType(), True),
        StructField("deadlineTime", StringType(), True),
        StructField("averageEntryScore", IntegerType(), True),
        StructField("highestScore", IntegerType(), True),
        StructField("finished", BooleanType(), True),
        StructField("dataChecked", BooleanType(), True),
        StructField("isCurrent", BooleanType(), True),
        StructField("isNext", BooleanType(), True),
    ]
)

FIXTURE_SCHEMA = StructType(
    [
        StructField("id", IntegerType(), True),
        StructField("code", LongType(), True),
        StructField("eventId", IntegerType(), True),
        StructField("kickoffTime", StringType(), True),
        StructField("teamHId", IntegerType(), True),
        StructField("teamAId", IntegerType(), True),
        StructField("teamHScore", IntegerType(), True),
        StructField("teamAScore", IntegerType(), True),
        StructField("teamHDifficulty", IntegerType(), True),
        StructField("teamADifficulty", IntegerType(), True),
        StructField("started", BooleanType(), True),
        StructField("finished", BooleanType(), True),
    ]
)

HISTORY_ROW_SCHEMA = StructType(
    [
        StructField("playerId", IntegerType(), True),
        StructField("fixtureId", IntegerType(), True),
        StructField("gameweekId", IntegerType(), True),
        StructField("opponentTeamId", IntegerType(), True),
        StructField("wasHome", BooleanType(), True),
        StructField("kickoffTime", StringType(), True),
        StructField("totalPoints", IntegerType(), True),
        StructField("minutes", IntegerType(), True),
        StructField("price", DoubleType(), True),
        StructField("selected", LongType(), True),
    ]
)

HISTORY_FILE_SCHEMA = StructType(
    [
        StructField("schemaVersion", IntegerType(), False),
        StructField("generatedAt", StringType(), False),
        StructField(
            "source",
            StructType(
                [
                    StructField("name", StringType(), False),
                    StructField("urlTemplate", StringType(), False),
                    StructField("fetchedAt", StringType(), False),
                ]
            ),
            False,
        ),
        StructField("inputSnapshotGeneratedAt", StringType(), False),
        StructField("inputSeason", StringType(), True),
        StructField("playerCount", IntegerType(), False),
        StructField("rowCount", IntegerType(), False),
        StructField("rows", ArrayType(HISTORY_ROW_SCHEMA, containsNull=False), False),
    ]
)

SNAPSHOT_METADATA_SCHEMA = StructType(
    [
        StructField("schemaVersion", IntegerType(), False),
        StructField("datasetType", StringType(), False),
        StructField("preparedAt", StringType(), False),
        StructField("sourceSnapshotHash", StringType(), False),
        StructField("canonicalSnapshotHash", StringType(), False),
        StructField("historyCaptureHash", StringType(), False),
        StructField("hashAlgorithm", StringType(), False),
        StructField("effectiveSeason", StringType(), False),
        StructField("sourceGeneratedAt", StringType(), False),
        StructField("historyGeneratedAt", StringType(), False),
        StructField("isTestFixture", BooleanType(), False),
        StructField("fixtureDescription", StringType(), True),
        StructField("recordCounts", MapType(StringType(), LongType()), False),
        StructField("fileSha256", MapType(StringType(), StringType()), False),
    ]
)


def add_common_task_arguments(parser: argparse.ArgumentParser, *, needs_input: bool = False) -> None:
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--schema", required=True)
    parser.add_argument("--pipeline-run-id", required=True)
    if needs_input:
        parser.add_argument("--input-path", required=True)


def validate_identifier(value: str, label: str) -> str:
    if not IDENTIFIER_PATTERN.fullmatch(value):
        raise ValueError(f"Invalid {label} identifier: {value!r}")
    return value


def qualified_table(catalog: str, schema: str, table: str) -> str:
    parts = (
        validate_identifier(catalog, "catalog"),
        validate_identifier(schema, "schema"),
        validate_identifier(table, "table"),
    )
    return ".".join(f"`{part}`" for part in parts)


def get_spark(app_name: str) -> SparkSession:
    return SparkSession.builder.appName(app_name).getOrCreate()


def require_columns(dataframe: DataFrame, required: Iterable[str], label: str) -> None:
    missing = sorted(set(required) - set(dataframe.columns))
    if missing:
        raise ValueError(f"{label} is missing required columns: {missing}")


def fail_on_invalid_ids(dataframe: DataFrame, columns: Sequence[str], label: str) -> None:
    invalid = None
    for column in columns:
        condition = (
            F.col(column).isNull()
            | (F.col(column) <= F.lit(0))
            | (F.col(column) > F.lit(MAX_DATABASE_ID))
        )
        invalid = condition if invalid is None else invalid | condition
    if invalid is not None and dataframe.filter(invalid).limit(1).count():
        raise ValueError(f"{label} contains invalid required identifiers: {list(columns)}")


def fail_on_invalid_numeric_bounds(
    dataframe: DataFrame,
    bounds: dict[str, tuple[float, float, bool]],
    label: str,
) -> None:
    """Reject null, non-finite, or out-of-range numbers in one Spark action.

    The final tuple item indicates whether null is allowed. Explicit schemas can
    turn a malformed JSON value into null, so required fields must check nulls
    here rather than relying on StructField(nullable=False).
    """
    invalid = None
    for column, (minimum, maximum, nullable) in bounds.items():
        value = F.col(column)
        numeric_invalid = F.isnan(value.cast("double")) | ~value.between(minimum, maximum)
        condition = numeric_invalid if nullable else value.isNull() | numeric_invalid
        invalid = condition if invalid is None else invalid | condition
    if invalid is not None and dataframe.filter(invalid).limit(1).count():
        raise ValueError(f"{label} contains null, non-finite, or out-of-range numeric values")


def fail_on_rows(dataframe: DataFrame, condition: Column, message: str) -> None:
    if dataframe.filter(condition).limit(1).count():
        raise ValueError(message)


def deterministic_deduplicate(
    dataframe: DataFrame,
    keys: Sequence[str],
    order_columns: Sequence[Column],
) -> DataFrame:
    require_columns(dataframe, keys, "deduplication input")
    window = Window.partitionBy(*keys).orderBy(*order_columns)
    return (
        dataframe.withColumn("_dedupe_rank", F.row_number().over(window))
        .filter(F.col("_dedupe_rank") == 1)
        .drop("_dedupe_rank")
    )


def merge_delta_table(
    spark: SparkSession,
    dataframe: DataFrame,
    catalog: str,
    schema: str,
    table: str,
    keys: Sequence[str],
) -> None:
    target = qualified_table(catalog, schema, table)
    require_columns(dataframe, keys, table)
    assert_unique_non_null_keys(dataframe, keys, table)
    if not spark.catalog.tableExists(f"{catalog}.{schema}.{table}"):
        # Serverless Spark Connect does not support errorifexists. The job's
        # max_concurrent_runs=1 setting makes this checked first-create append safe.
        dataframe.write.format("delta").mode("append").saveAsTable(target)
        return

    view_name = validate_identifier(f"_scoutiq_{table}_source", "temporary view")
    dataframe.createOrReplaceTempView(view_name)
    join_condition = " AND ".join(f"target.`{key}` <=> source.`{key}`" for key in keys)
    spark.sql(
        f"""
        MERGE INTO {target} AS target
        USING `{view_name}` AS source
        ON {join_condition}
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
        """
    )
    spark.catalog.dropTempView(view_name)


def assert_unique_non_null_keys(dataframe: DataFrame, keys: Sequence[str], label: str) -> None:
    null_condition = None
    for key in keys:
        condition = F.col(key).isNull()
        null_condition = condition if null_condition is None else null_condition | condition
    if null_condition is not None and dataframe.filter(null_condition).limit(1).count():
        raise ValueError(f"{label} contains null Delta merge keys: {list(keys)}")

    duplicate = dataframe.groupBy(*keys).count().filter(F.col("count") > 1).limit(1)
    if duplicate.count():
        example = duplicate.drop("count").first().asDict()
        raise ValueError(f"{label} contains duplicate Delta merge keys {list(keys)}: {example}")


def load_tables(
    spark: SparkSession,
    catalog: str,
    schema: str,
    table_names: Iterable[str],
) -> dict[str, DataFrame]:
    return {
        table: spark.table(qualified_table(catalog, schema, table))
        for table in table_names
    }


def table_counts(tables: dict[str, DataFrame]) -> dict[str, int]:
    return {name: dataframe.count() for name, dataframe in sorted(tables.items())}


def print_task_summary(task: str, **values: Any) -> None:
    print(json.dumps({"task": task, **values}, sort_keys=True, default=str))
