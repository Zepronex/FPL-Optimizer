from __future__ import annotations

import argparse
from collections.abc import Sequence

from pyspark.sql import DataFrame, SparkSession, Window
from pyspark.sql import functions as F

try:
    from scoutiq_databricks import PIPELINE_NAME
    from scoutiq_databricks.common import (
        GOLD_TABLE_KEYS,
        SILVER_TABLE_KEYS,
        add_common_task_arguments,
        fail_on_rows,
        get_spark,
        load_tables,
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
        GOLD_TABLE_KEYS,
        SILVER_TABLE_KEYS,
        add_common_task_arguments,
        fail_on_rows,
        get_spark,
        load_tables,
        merge_delta_table,
        print_task_summary,
        table_counts,
    )


def build_gold_tables(silver: dict[str, DataFrame]) -> dict[str, DataFrame]:
    team_fixture_features = build_team_fixture_features(
        silver["silver_fixtures"],
        silver["silver_gameweeks"],
        silver["silver_teams"],
    )
    current_features = build_current_player_gameweek_features(
        silver["silver_players"],
        silver["silver_gameweeks"],
        team_fixture_features,
    )
    historical_features, historical_outcomes = build_historical_player_gameweek_tables(
        silver["silver_player_gameweek_history"],
        silver["silver_players"],
        silver["silver_fixtures"],
        silver["silver_gameweeks"],
    )
    return {
        "gold_team_fixture_features": team_fixture_features,
        "gold_current_player_gameweek_features": current_features,
        "gold_historical_player_gameweek_features": historical_features,
        "gold_historical_player_gameweek_outcomes": historical_outcomes,
    }


def build_team_fixture_features(fixtures: DataFrame, gameweeks: DataFrame, teams: DataFrame) -> DataFrame:
    upcoming = fixtures.filter(
        F.col("gameweek_id").isNotNull()
        & ~F.coalesce(F.col("started"), F.lit(False))
        & ~F.coalesce(F.col("finished"), F.lit(False))
    )
    candidates = upcoming.alias("fixture").join(
        gameweeks.select("source_snapshot_hash", "gameweek_id", "deadline_time", "is_next").alias("gameweek"),
        (F.col("fixture.source_snapshot_hash") == F.col("gameweek.source_snapshot_hash"))
        & (F.col("fixture.gameweek_id") == F.col("gameweek.gameweek_id")),
        "inner",
    ).select(
        *[F.col(f"fixture.{column}") for column in upcoming.columns],
        F.col("gameweek.deadline_time"),
        F.col("gameweek.is_next"),
    )
    target_gameweeks = candidates.groupBy("source_snapshot_hash").agg(
        F.coalesce(
            F.min(F.when(F.col("is_next"), F.col("gameweek_id"))),
            F.min("gameweek_id"),
        ).alias("target_gameweek_id")
    )
    selected = candidates.alias("fixture").join(
        target_gameweeks.alias("target"),
        (F.col("fixture.source_snapshot_hash") == F.col("target.source_snapshot_hash"))
        & (F.col("fixture.gameweek_id") == F.col("target.target_gameweek_id")),
        "inner",
    ).select("fixture.*")
    selected = selected.filter(F.col("source_generated_at") < F.col("deadline_time"))

    common_columns = (
        "source_snapshot_hash",
        "history_capture_hash",
        "season",
        "gameweek_id",
        "fixture_id",
        "kickoff_time",
        "deadline_time",
        "source_generated_at",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        "pipeline_run_id",
    )
    home = selected.select(
        *common_columns,
        F.col("team_h_id").alias("team_id"),
        F.col("team_a_id").alias("opponent_team_id"),
        F.lit("H").alias("home_away"),
        F.col("team_h_difficulty").alias("fixture_difficulty"),
    )
    away = selected.select(
        *common_columns,
        F.col("team_a_id").alias("team_id"),
        F.col("team_h_id").alias("opponent_team_id"),
        F.lit("A").alias("home_away"),
        F.col("team_a_difficulty").alias("fixture_difficulty"),
    )
    contexts = home.unionByName(away)
    team_names = teams.select("source_snapshot_hash", "team_id", "team_name")
    return contexts.alias("context").join(
        team_names.alias("team"),
        (F.col("context.source_snapshot_hash") == F.col("team.source_snapshot_hash"))
        & (F.col("context.team_id") == F.col("team.team_id")),
        "inner",
    ).join(
        team_names.alias("opponent"),
        (F.col("context.source_snapshot_hash") == F.col("opponent.source_snapshot_hash"))
        & (F.col("context.opponent_team_id") == F.col("opponent.team_id")),
        "inner",
    ).select(
        *[F.col(f"context.{column}") for column in contexts.columns],
        F.col("team.team_name"),
        F.col("opponent.team_name").alias("opponent_team_name"),
        F.lit(True).alias("source_capture_precedes_deadline"),
        F.current_timestamp().alias("gold_transformed_at"),
    )


def build_current_player_gameweek_features(
    players: DataFrame,
    gameweeks: DataFrame,
    team_fixture_features: DataFrame,
) -> DataFrame:
    completed = gameweeks.filter(F.col("finished") & F.col("data_checked")).groupBy(
        "source_snapshot_hash"
    ).agg(F.countDistinct("gameweek_id").alias("completed_gameweeks"))
    player_fixtures = players.alias("player").join(
        team_fixture_features.alias("fixture"),
        (F.col("player.source_snapshot_hash") == F.col("fixture.source_snapshot_hash"))
        & (F.col("player.team_id") == F.col("fixture.team_id")),
        "inner",
    )
    return player_fixtures.join(
        completed.alias("completed"),
        F.col("player.source_snapshot_hash") == F.col("completed.source_snapshot_hash"),
        "left",
    ).select(
        F.col("player.source_snapshot_hash"),
        F.col("player.history_capture_hash"),
        F.col("player.season"),
        F.col("fixture.gameweek_id"),
        F.col("fixture.fixture_id"),
        F.col("player.player_id"),
        F.col("player.player_name"),
        F.col("player.position"),
        F.col("player.team_id"),
        F.col("player.team_name"),
        F.col("fixture.opponent_team_id"),
        F.col("fixture.opponent_team_name"),
        F.col("fixture.home_away"),
        F.col("fixture.fixture_difficulty"),
        F.col("fixture.kickoff_time"),
        F.col("fixture.deadline_time").alias("feature_cutoff_time"),
        F.col("player.price"),
        F.col("player.status").alias("availability_status"),
        F.col("player.chance_of_playing_next_round"),
        F.col("player.chance_of_playing_this_round"),
        F.col("player.form").alias("recent_points_average"),
        F.col("player.selected_by_percent"),
        F.col("player.total_points"),
        F.col("player.minutes"),
        F.coalesce(F.col("completed.completed_gameweeks"), F.lit(0)).alias("completed_gameweeks"),
        F.when(
            F.col("completed.completed_gameweeks") > 0,
            F.col("player.total_points") / F.col("completed.completed_gameweeks"),
        ).otherwise(F.col("player.points_per_game")).alias("season_points_average"),
        F.when(
            F.col("completed.completed_gameweeks") > 0,
            F.col("player.minutes") / F.col("completed.completed_gameweeks"),
        ).otherwise(F.lit(0.0)).alias("season_minutes_average"),
        F.col("player.points_per_game"),
        F.col("player.value_season"),
        F.col("player.source_generated_at"),
        F.col("player.dataset_type"),
        F.col("player.is_test_fixture"),
        F.col("player.fixture_description"),
        F.col("player.pipeline_run_id"),
        F.lit(True).alias("source_capture_precedes_deadline"),
        F.current_timestamp().alias("gold_transformed_at"),
    )


def build_historical_player_gameweek_tables(
    history: DataFrame,
    players: DataFrame,
    fixtures: DataFrame,
    gameweeks: DataFrame,
) -> tuple[DataFrame, DataFrame]:
    joined = history.alias("history").join(
        fixtures.alias("fixture"),
        (F.col("history.source_snapshot_hash") == F.col("fixture.source_snapshot_hash"))
        & (F.col("history.fixture_id") == F.col("fixture.fixture_id"))
        & (F.col("history.gameweek_id") == F.col("fixture.gameweek_id")),
        "inner",
    ).join(
        gameweeks.select("source_snapshot_hash", "gameweek_id", "deadline_time").alias("gameweek"),
        (F.col("history.source_snapshot_hash") == F.col("gameweek.source_snapshot_hash"))
        & (F.col("history.gameweek_id") == F.col("gameweek.gameweek_id")),
        "inner",
    ).join(
        players.select("source_snapshot_hash", "player_id", "player_name", "position").alias("player"),
        (F.col("history.source_snapshot_hash") == F.col("player.source_snapshot_hash"))
        & (F.col("history.player_id") == F.col("player.player_id")),
        "inner",
    ).select(
        "history.*",
        F.col("fixture.team_h_id"),
        F.col("fixture.team_a_id"),
        F.col("gameweek.deadline_time"),
        F.col("player.player_name"),
        F.col("player.position"),
    ).withColumn(
        "player_team_id",
        F.when(F.col("was_home"), F.col("team_h_id")).otherwise(F.col("team_a_id")),
    ).withColumn(
        "fixture_opponent_team_id",
        F.when(F.col("was_home"), F.col("team_a_id")).otherwise(F.col("team_h_id")),
    )

    fail_on_rows(
        joined,
        F.col("kickoff_time").isNull()
        | F.col("deadline_time").isNull()
        | (F.col("kickoff_time") < F.col("deadline_time")),
        "Historical rows must have a kickoff at or after the gameweek deadline",
    )
    fail_on_rows(
        joined,
        F.col("opponent_team_id") != F.col("fixture_opponent_team_id"),
        "Historical opponent identifiers do not match fixture lineage",
    )

    aggregate_keys = (
        "source_snapshot_hash",
        "history_capture_hash",
        "season",
        "gameweek_id",
        "player_id",
        "player_name",
        "position",
        "player_team_id",
        "deadline_time",
        "source_generated_at",
        "history_generated_at",
        "source_fetched_at",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        "pipeline_run_id",
    )
    gameweek_rows = joined.groupBy(*aggregate_keys).agg(
        F.sum("total_points").cast("double").alias("actual_points"),
        F.sum("minutes").cast("double").alias("actual_minutes"),
        F.max("price").alias("price_at_deadline"),
        F.max("selected").alias("selected_at_deadline"),
        F.countDistinct("fixture_id").alias("fixture_count"),
        F.sort_array(F.collect_set("fixture_id")).alias("fixture_ids"),
        F.sort_array(F.collect_set("opponent_team_id")).alias("opponent_team_ids"),
        F.sum(F.when(F.col("was_home"), 1).otherwise(0)).alias("home_fixture_count"),
        F.sum(F.when(~F.col("was_home"), 1).otherwise(0)).alias("away_fixture_count"),
        F.min("kickoff_time").alias("first_kickoff_time"),
        F.max("kickoff_time").alias("last_kickoff_time"),
    )

    prior_window = (
        Window.partitionBy("source_snapshot_hash", "season", "player_id")
        .orderBy("gameweek_id")
        .rowsBetween(Window.unboundedPreceding, -1)
    )
    recent_window = (
        Window.partitionBy("source_snapshot_hash", "season", "player_id")
        .orderBy("gameweek_id")
        .rowsBetween(-5, -1)
    )
    featured = (
        gameweek_rows.withColumn("completed_gameweeks", F.count("gameweek_id").over(prior_window))
        .withColumn("season_points_average", F.avg("actual_points").over(prior_window))
        .withColumn("season_minutes_average", F.avg("actual_minutes").over(prior_window))
        .withColumn("rolling_points_average", F.avg("actual_points").over(recent_window))
        .withColumn("rolling_minutes_average", F.avg("actual_minutes").over(recent_window))
        .withColumn("previous_gameweek_points", F.lag("actual_points", 1).over(
            Window.partitionBy("source_snapshot_hash", "season", "player_id").orderBy("gameweek_id")
        ))
        .withColumn("previous_gameweek_minutes", F.lag("actual_minutes", 1).over(
            Window.partitionBy("source_snapshot_hash", "season", "player_id").orderBy("gameweek_id")
        ))
    )

    feature_columns = [
        "source_snapshot_hash",
        "history_capture_hash",
        "season",
        "gameweek_id",
        "player_id",
        "player_name",
        "position",
        "completed_gameweeks",
        "season_points_average",
        "season_minutes_average",
        "rolling_points_average",
        "rolling_minutes_average",
        "previous_gameweek_points",
        "previous_gameweek_minutes",
        "source_generated_at",
        "history_generated_at",
        "source_fetched_at",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        "pipeline_run_id",
    ]
    features = featured.select(
        *feature_columns,
        F.col("rolling_points_average").alias("recent_points_average"),
        F.col("season_points_average").alias("points_per_game"),
        F.col("gameweek_id").alias("feature_cutoff_gameweek_id"),
        F.lit(True).alias("performance_features_use_only_prior_gameweeks"),
        F.lit("prior_player_gameweek_history_only_for_model").alias("historical_feature_contract"),
        F.current_timestamp().alias("gold_transformed_at"),
    )
    outcomes = featured.select(
        "source_snapshot_hash",
        "history_capture_hash",
        "season",
        "gameweek_id",
        "player_id",
        "player_name",
        "position",
        "fixture_count",
        "fixture_ids",
        "actual_points",
        "actual_minutes",
        "first_kickoff_time",
        "last_kickoff_time",
        "history_generated_at",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        "pipeline_run_id",
        F.current_timestamp().alias("gold_transformed_at"),
    )
    return features, outcomes


def run(
    spark: SparkSession,
    *,
    catalog: str,
    schema: str,
    pipeline_run_id: str,
) -> dict[str, int]:
    silver = load_tables(spark, catalog, schema, SILVER_TABLE_KEYS)
    tables = build_gold_tables(silver)
    for table_name, dataframe in tables.items():
        merge_delta_table(spark, dataframe, catalog, schema, table_name, GOLD_TABLE_KEYS[table_name])
    counts = table_counts(tables)
    print_task_summary(
        "gold",
        pipeline_run_id=pipeline_run_id,
        catalog=catalog,
        schema=schema,
        row_counts=counts,
    )
    return counts


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build leakage-aware ScoutIQ Gold Delta feature tables.")
    add_common_task_arguments(parser)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    spark = get_spark(f"{PIPELINE_NAME}-gold")
    run(spark, catalog=args.catalog, schema=args.schema, pipeline_run_id=args.pipeline_run_id)
    return 0


if __name__ == "__main__":
    main()
