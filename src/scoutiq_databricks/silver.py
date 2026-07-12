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
        HISTORY_ROW_SCHEMA,
        PLAYER_SCHEMA,
        SILVER_TABLE_KEYS,
        TEAM_SCHEMA,
        add_common_task_arguments,
        deterministic_deduplicate,
        fail_on_invalid_ids,
        fail_on_invalid_numeric_bounds,
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
        BRONZE_TABLE_KEYS,
        FIXTURE_SCHEMA,
        GAMEWEEK_SCHEMA,
        HISTORY_ROW_SCHEMA,
        PLAYER_SCHEMA,
        SILVER_TABLE_KEYS,
        TEAM_SCHEMA,
        add_common_task_arguments,
        deterministic_deduplicate,
        fail_on_invalid_ids,
        fail_on_invalid_numeric_bounds,
        fail_on_rows,
        get_spark,
        load_tables,
        merge_delta_table,
        print_task_summary,
        table_counts,
    )


def build_silver_tables(bronze: dict[str, DataFrame]) -> dict[str, DataFrame]:
    teams_parsed = _parse_entity(bronze["bronze_teams_raw"], TEAM_SCHEMA, ("source_snapshot_hash", "record_id"))
    teams = teams_parsed.select(
        "source_snapshot_hash",
        F.col("record.id").alias("team_id"),
        F.col("record.code").alias("code"),
        F.col("record.name").alias("team_name"),
        F.col("record.shortName").alias("team_short_name"),
        F.col("record.strength").alias("strength"),
        F.col("record.strengthOverallHome").alias("strength_overall_home"),
        F.col("record.strengthOverallAway").alias("strength_overall_away"),
        "season",
        "source_generated_at",
        "history_capture_hash",
        "history_generated_at",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        "pipeline_run_id",
        F.current_timestamp().alias("silver_transformed_at"),
    )
    fail_on_invalid_ids(teams, ("team_id",), "silver teams")
    fail_on_rows(teams, F.col("team_name").isNull() | (F.trim("team_name") == ""), "Silver teams contain missing names")
    fail_on_invalid_numeric_bounds(
        teams,
        {
            "code": (1, 2_147_483_647, True),
            "strength": (0, 10_000, True),
            "strength_overall_home": (0, 10_000, True),
            "strength_overall_away": (0, 10_000, True),
        },
        "Silver teams",
    )

    players_parsed = _parse_entity(
        bronze["bronze_players_raw"], PLAYER_SCHEMA, ("source_snapshot_hash", "record_id")
    )
    players_base = players_parsed.select(
        "source_snapshot_hash",
        F.col("record.id").alias("player_id"),
        F.col("record.code").alias("code"),
        F.col("record.firstName").alias("first_name"),
        F.col("record.secondName").alias("second_name"),
        F.col("record.webName").alias("web_name"),
        F.col("record.displayName").alias("player_name"),
        F.col("record.teamId").alias("team_id"),
        F.col("record.position").alias("position"),
        F.col("record.nowCost").alias("price"),
        F.col("record.status").alias("status"),
        F.col("record.chanceOfPlayingNextRound").alias("chance_of_playing_next_round"),
        F.col("record.chanceOfPlayingThisRound").alias("chance_of_playing_this_round"),
        F.col("record.form").alias("form"),
        F.col("record.selectedByPercent").alias("selected_by_percent"),
        F.col("record.pointsPerGame").alias("points_per_game"),
        F.col("record.valueSeason").alias("value_season"),
        F.col("record.totalPoints").alias("total_points"),
        F.col("record.minutes").alias("minutes"),
        F.col("record.starts").alias("starts"),
        F.col("record.expectedGoals").alias("expected_goals"),
        F.col("record.expectedAssists").alias("expected_assists"),
        F.col("record.expectedGoalInvolvements").alias("expected_goal_involvements"),
        F.col("record.expectedGoalsConceded").alias("expected_goals_conceded"),
        "season",
        "source_generated_at",
        "history_capture_hash",
        "history_generated_at",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        "pipeline_run_id",
    )
    fail_on_invalid_ids(players_base, ("player_id", "team_id"), "silver players")
    fail_on_rows(
        players_base,
        F.col("position").isNull() | ~F.col("position").isin("GK", "DEF", "MID", "FWD"),
        "Silver players contain invalid positions",
    )
    fail_on_rows(
        players_base,
        F.col("player_name").isNull() | (F.trim("player_name") == ""),
        "Silver players contain missing names",
    )
    fail_on_invalid_numeric_bounds(
        players_base,
        {
            "code": (1, 2_147_483_647, True),
            "price": (0, 100, False),
            "chance_of_playing_next_round": (0, 100, True),
            "chance_of_playing_this_round": (0, 100, True),
            "form": (-100, 100, False),
            "selected_by_percent": (0, 100, False),
            "points_per_game": (0, 100, False),
            "value_season": (0, 1_000, False),
            "total_points": (-1_000, 10_000, False),
            "minutes": (0, 10_000, False),
            "starts": (0, 100, False),
            "expected_goals": (0, 1_000, False),
            "expected_assists": (0, 1_000, False),
            "expected_goal_involvements": (0, 1_000, False),
            "expected_goals_conceded": (0, 1_000, False),
        },
        "Silver players",
    )
    missing_player_teams = players_base.alias("player").join(
        teams.alias("team"),
        (F.col("player.source_snapshot_hash") == F.col("team.source_snapshot_hash"))
        & (F.col("player.team_id") == F.col("team.team_id")),
        "left_anti",
    )
    if missing_player_teams.limit(1).count():
        raise ValueError("Silver players reference teams absent from the same source snapshot")
    players = players_base.alias("player").join(
        teams.select(
            "source_snapshot_hash",
            "team_id",
            "team_name",
            "team_short_name",
        ).alias("team"),
        (F.col("player.source_snapshot_hash") == F.col("team.source_snapshot_hash"))
        & (F.col("player.team_id") == F.col("team.team_id")),
        "inner",
    ).select(
        *[F.col(f"player.{column}") for column in players_base.columns],
        F.col("team.team_name"),
        F.col("team.team_short_name"),
        F.current_timestamp().alias("silver_transformed_at"),
    )

    gameweeks_parsed = _parse_entity(
        bronze["bronze_gameweeks_raw"], GAMEWEEK_SCHEMA, ("source_snapshot_hash", "record_id")
    )
    gameweeks = gameweeks_parsed.select(
        "source_snapshot_hash",
        F.col("record.id").alias("gameweek_id"),
        F.col("record.name").alias("gameweek_name"),
        F.to_timestamp("record.deadlineTime").alias("deadline_time"),
        F.col("record.averageEntryScore").alias("average_entry_score"),
        F.col("record.highestScore").alias("highest_score"),
        F.col("record.finished").alias("finished"),
        F.col("record.dataChecked").alias("data_checked"),
        F.col("record.isCurrent").alias("is_current"),
        F.col("record.isNext").alias("is_next"),
        "season",
        "source_generated_at",
        "history_capture_hash",
        "history_generated_at",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        "pipeline_run_id",
        F.current_timestamp().alias("silver_transformed_at"),
    )
    fail_on_invalid_ids(gameweeks, ("gameweek_id",), "silver gameweeks")
    fail_on_rows(gameweeks, F.col("deadline_time").isNull(), "Silver gameweeks contain invalid deadlines")
    fail_on_invalid_numeric_bounds(
        gameweeks,
        {
            "gameweek_id": (1, 38, False),
            "average_entry_score": (0, 1_000, True),
            "highest_score": (0, 1_000, True),
        },
        "Silver gameweeks",
    )
    fail_on_rows(
        gameweeks,
        F.col("finished").isNull()
        | F.col("data_checked").isNull()
        | F.col("is_current").isNull()
        | F.col("is_next").isNull(),
        "Silver gameweeks contain malformed required boolean flags",
    )

    fixtures_parsed = _parse_entity(
        bronze["bronze_fixtures_raw"], FIXTURE_SCHEMA, ("source_snapshot_hash", "record_id")
    )
    fixtures = fixtures_parsed.select(
        "source_snapshot_hash",
        F.col("record.id").alias("fixture_id"),
        F.col("record.code").alias("code"),
        F.col("record.eventId").alias("gameweek_id"),
        F.to_timestamp("record.kickoffTime").alias("kickoff_time"),
        F.col("record.teamHId").alias("team_h_id"),
        F.col("record.teamAId").alias("team_a_id"),
        F.col("record.teamHScore").alias("team_h_score"),
        F.col("record.teamAScore").alias("team_a_score"),
        F.col("record.teamHDifficulty").alias("team_h_difficulty"),
        F.col("record.teamADifficulty").alias("team_a_difficulty"),
        F.col("record.started").alias("started"),
        F.col("record.finished").alias("finished"),
        "season",
        "source_generated_at",
        "history_capture_hash",
        "history_generated_at",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        "pipeline_run_id",
        F.current_timestamp().alias("silver_transformed_at"),
    )
    fail_on_invalid_ids(fixtures, ("fixture_id", "team_h_id", "team_a_id"), "silver fixtures")
    fail_on_rows(fixtures, F.col("team_h_id") == F.col("team_a_id"), "Silver fixtures contain identical teams")
    fail_on_rows(
        fixtures,
        F.col("team_h_difficulty").isNull()
        | F.col("team_a_difficulty").isNull()
        | ~F.col("team_h_difficulty").between(1, 5)
        | ~F.col("team_a_difficulty").between(1, 5),
        "Silver fixtures contain invalid difficulty values",
    )
    fail_on_invalid_numeric_bounds(
        fixtures,
        {
            "code": (1, 2_147_483_647, True),
            "gameweek_id": (1, 38, True),
            "team_h_score": (0, 100, True),
            "team_a_score": (0, 100, True),
            "team_h_difficulty": (1, 5, False),
            "team_a_difficulty": (1, 5, False),
        },
        "Silver fixtures",
    )
    fail_on_rows(
        fixtures,
        F.col("started").isNull() | F.col("finished").isNull(),
        "Silver fixtures contain malformed required boolean flags",
    )
    _validate_fixture_references(fixtures, teams, gameweeks)

    history_parsed = _parse_history(bronze["bronze_player_gameweek_history_raw"])
    history = history_parsed.select(
        "source_snapshot_hash",
        "history_capture_hash",
        F.col("record.playerId").alias("player_id"),
        F.col("record.fixtureId").alias("fixture_id"),
        F.col("record.gameweekId").alias("gameweek_id"),
        F.col("record.opponentTeamId").alias("opponent_team_id"),
        F.col("record.wasHome").alias("was_home"),
        F.to_timestamp("record.kickoffTime").alias("kickoff_time"),
        F.col("record.totalPoints").alias("total_points"),
        F.col("record.minutes").alias("minutes"),
        F.col("record.price").alias("price"),
        F.col("record.selected").alias("selected"),
        "season",
        "source_generated_at",
        "history_generated_at",
        "source_fetched_at",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        "pipeline_run_id",
        F.current_timestamp().alias("silver_transformed_at"),
    )
    fail_on_invalid_ids(
        history,
        ("player_id", "fixture_id", "gameweek_id", "opponent_team_id"),
        "silver player history",
    )
    fail_on_rows(
        history,
        F.col("minutes").isNull()
        | (F.col("minutes") < 0)
        | F.col("total_points").isNull()
        | F.col("was_home").isNull(),
        "Silver player history contains malformed values",
    )
    fail_on_invalid_numeric_bounds(
        history,
        {
            "gameweek_id": (1, 38, False),
            "opponent_team_id": (1, 100, False),
            "total_points": (-20, 100, False),
            "minutes": (0, 180, False),
            "price": (0, 100, False),
            "selected": (0, 100_000_000, False),
        },
        "Silver player history",
    )
    _validate_history_references(history, players, fixtures, gameweeks, teams)

    return {
        "silver_players": players,
        "silver_teams": teams,
        "silver_gameweeks": gameweeks,
        "silver_fixtures": fixtures,
        "silver_player_gameweek_history": history,
    }


def run(
    spark: SparkSession,
    *,
    catalog: str,
    schema: str,
    pipeline_run_id: str,
) -> dict[str, int]:
    bronze = load_tables(spark, catalog, schema, BRONZE_TABLE_KEYS)
    tables = build_silver_tables(bronze)
    for table_name, dataframe in tables.items():
        merge_delta_table(spark, dataframe, catalog, schema, table_name, SILVER_TABLE_KEYS[table_name])
    counts = table_counts(tables)
    print_task_summary(
        "silver",
        pipeline_run_id=pipeline_run_id,
        catalog=catalog,
        schema=schema,
        row_counts=counts,
    )
    return counts


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize ScoutIQ Bronze tables into Silver Delta tables.")
    add_common_task_arguments(parser)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    spark = get_spark(f"{PIPELINE_NAME}-silver")
    run(spark, catalog=args.catalog, schema=args.schema, pipeline_run_id=args.pipeline_run_id)
    return 0


def _parse_entity(raw: DataFrame, schema, keys: Sequence[str]) -> DataFrame:
    deduplicated = deterministic_deduplicate(
        raw,
        keys,
        (
            F.col("source_generated_at").desc_nulls_last(),
            F.col("bronze_ingested_at").desc_nulls_last(),
            F.sha2("raw_record_json", 256).asc(),
        ),
    )
    return deduplicated.withColumn("record", F.from_json("raw_record_json", schema))


def _parse_history(raw: DataFrame) -> DataFrame:
    deduplicated = deterministic_deduplicate(
        raw,
        ("source_snapshot_hash", "player_id", "gameweek_id", "fixture_id"),
        (
            F.col("history_generated_at").desc_nulls_last(),
            F.col("bronze_ingested_at").desc_nulls_last(),
            F.sha2("raw_record_json", 256).asc(),
        ),
    )
    return deduplicated.withColumn("record", F.from_json("raw_record_json", HISTORY_ROW_SCHEMA))


def _validate_fixture_references(fixtures: DataFrame, teams: DataFrame, gameweeks: DataFrame) -> None:
    team_keys = teams.select("source_snapshot_hash", "team_id")
    for team_column in ("team_h_id", "team_a_id"):
        missing = fixtures.alias("fixture").join(
            team_keys.alias("team"),
            (F.col("fixture.source_snapshot_hash") == F.col("team.source_snapshot_hash"))
            & (F.col(f"fixture.{team_column}") == F.col("team.team_id")),
            "left_anti",
        )
        if missing.limit(1).count():
            raise ValueError(f"Silver fixtures reference missing {team_column} values")
    missing_gameweeks = fixtures.filter(F.col("gameweek_id").isNotNull()).alias("fixture").join(
        gameweeks.select("source_snapshot_hash", "gameweek_id").alias("gameweek"),
        (F.col("fixture.source_snapshot_hash") == F.col("gameweek.source_snapshot_hash"))
        & (F.col("fixture.gameweek_id") == F.col("gameweek.gameweek_id")),
        "left_anti",
    )
    if missing_gameweeks.limit(1).count():
        raise ValueError("Silver fixtures reference missing gameweeks")


def _validate_history_references(
    history: DataFrame,
    players: DataFrame,
    fixtures: DataFrame,
    gameweeks: DataFrame,
    teams: DataFrame,
) -> None:
    references = (
        ("player_id", players, "player_id"),
        ("fixture_id", fixtures, "fixture_id"),
        ("gameweek_id", gameweeks, "gameweek_id"),
        ("opponent_team_id", teams, "team_id"),
    )
    for history_column, reference, reference_column in references:
        missing = history.alias("history").join(
            reference.select("source_snapshot_hash", reference_column).alias("reference"),
            (F.col("history.source_snapshot_hash") == F.col("reference.source_snapshot_hash"))
            & (F.col(f"history.{history_column}") == F.col(f"reference.{reference_column}")),
            "left_anti",
        )
        if missing.limit(1).count():
            raise ValueError(f"Silver player history references missing {history_column} values")


if __name__ == "__main__":
    main()
