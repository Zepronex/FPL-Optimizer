from __future__ import annotations

import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

from scoutiq_databricks.bronze import (
    build_bronze_tables,
    read_public_snapshot,
    validate_public_snapshot,
)
from scoutiq_databricks.common import assert_unique_non_null_keys, deterministic_deduplicate
from scoutiq_databricks.evaluation import (
    BASELINE_VARIANT,
    MODEL_VARIANT,
    build_evaluation_tables,
    build_metrics_table,
)
from scoutiq_databricks.gold import (
    build_gold_tables,
    build_historical_player_gameweek_tables,
)
from scoutiq_databricks.silver import build_silver_tables

REPO_ROOT = Path(__file__).resolve().parents[3]
PUBLIC_FIXTURE = REPO_ROOT / "fixtures" / "databricks" / "public_fpl_snapshot"


class SparkTransformTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temporary_directory = tempfile.TemporaryDirectory()
        os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
        cls.spark = (
            SparkSession.builder.master("local[1]")
            .appName("scoutiq-databricks-tests")
            .config("spark.ui.enabled", "false")
            .config("spark.sql.shuffle.partitions", "1")
            .config("spark.sql.session.timeZone", "UTC")
            .config("spark.sql.warehouse.dir", str(Path(cls.temporary_directory.name) / "warehouse"))
            .getOrCreate()
        )
        cls.spark.sparkContext.setLogLevel("ERROR")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.spark.stop()
        cls.temporary_directory.cleanup()

    def setUp(self) -> None:
        self.bronze = build_bronze_tables(self.spark, str(PUBLIC_FIXTURE), "fixture-run")
        self.silver = build_silver_tables(self.bronze)

    def test_bronze_to_silver_preserves_public_metadata_and_schema(self) -> None:
        self.assertEqual(self.bronze["bronze_players_raw"].count(), 8)
        self.assertEqual(self.bronze["bronze_player_gameweek_history_raw"].count(), 64)
        manifest = self.bronze["bronze_ingestion_manifest"].first().asDict()
        self.assertEqual(manifest["dataset_type"], "public-fpl")
        self.assertTrue(manifest["is_test_fixture"])
        self.assertEqual(manifest["season"], "2025-26")
        self.assertEqual(len(manifest["source_snapshot_hash"]), 64)
        urls = {
            row.source_url
            for row in self.bronze["bronze_source_metadata"].select("source_url").collect()
        }
        self.assertIn("https://fantasy.premierleague.com/api/bootstrap-static/", urls)
        self.assertEqual(self.silver["silver_players"].count(), 8)
        self.assertEqual(self.silver["silver_teams"].count(), 20)
        self.assertEqual(self.silver["silver_gameweeks"].count(), 8)
        self.assertEqual(self.silver["silver_fixtures"].count(), 49)
        self.assertEqual(self.silver["silver_player_gameweek_history"].count(), 64)
        self.assertEqual(
            self.silver["silver_players"].filter(F.col("player_id").isNull()).count(),
            0,
        )

    def test_deterministic_deduplication_uses_explicit_tie_breakers(self) -> None:
        rows = [
            ("snapshot", 1, "2026-01-01T00:00:00Z", "older"),
            ("snapshot", 1, "2026-01-02T00:00:00Z", "newer"),
            ("snapshot", 2, "2026-01-01T00:00:00Z", "only"),
        ]
        dataframe = self.spark.createDataFrame(rows, ("snapshot", "id", "observed_at", "value")).withColumn(
            "observed_at", F.to_timestamp("observed_at")
        )
        deduplicated = deterministic_deduplicate(
            dataframe,
            ("snapshot", "id"),
            (F.col("observed_at").desc(), F.col("value").asc()),
        )
        values = {row.id: row.value for row in deduplicated.select("id", "value").collect()}
        self.assertEqual(values, {1: "newer", 2: "only"})

    def test_delta_merge_keys_reject_duplicates_and_nulls(self) -> None:
        duplicates = self.spark.createDataFrame([("snapshot", 1), ("snapshot", 1)], ("snapshot", "id"))
        with self.assertRaisesRegex(ValueError, "duplicate Delta merge keys"):
            assert_unique_non_null_keys(duplicates, ("snapshot", "id"), "test_table")

        nulls = self.spark.createDataFrame([("snapshot", None)], "snapshot string, id int")
        with self.assertRaisesRegex(ValueError, "null Delta merge keys"):
            assert_unique_non_null_keys(nulls, ("snapshot", "id"), "test_table")

    def test_silver_to_gold_uses_prior_gameweeks_and_separates_outcomes(self) -> None:
        gold = build_gold_tables(self.silver)
        features = gold["gold_historical_player_gameweek_features"]
        outcomes = gold["gold_historical_player_gameweek_outcomes"]
        self.assertEqual(features.count(), 64)
        self.assertEqual(outcomes.count(), 64)
        self.assertNotIn("actual_points", features.columns)
        self.assertNotIn("actual_minutes", features.columns)
        for unsafe_column in (
            "fixture_count",
            "fixture_ids",
            "opponent_team_ids",
            "home_fixture_count",
            "away_fixture_count",
            "first_kickoff_time",
            "last_kickoff_time",
            "deadline_time",
        ):
            self.assertNotIn(unsafe_column, features.columns)
        self.assertIn("actual_points", outcomes.columns)

        player_id = features.select(F.min("player_id")).first()[0]
        third = (
            features.filter(F.col("player_id") == player_id)
            .orderBy("gameweek_id")
            .collect()[2]
        )
        prior_points = [
            row.actual_points
            for row in outcomes.filter(
                (F.col("player_id") == player_id) & (F.col("gameweek_id") < third.gameweek_id)
            ).collect()
        ]
        self.assertAlmostEqual(third.season_points_average, sum(prior_points) / len(prior_points))
        self.assertTrue(third.performance_features_use_only_prior_gameweeks)

    def test_double_gameweek_is_aggregated_before_rolling_window(self) -> None:
        common_history = {
            "source_snapshot_hash": "s" * 64,
            "history_capture_hash": "h" * 64,
            "player_id": 1,
            "opponent_team_id": 2,
            "was_home": True,
            "minutes": 90,
            "price": 5.0,
            "selected": 100,
            "season": "2025-26",
            "source_generated_at": datetime(2026, 3, 1, tzinfo=timezone.utc),
            "history_generated_at": datetime(2026, 3, 1, tzinfo=timezone.utc),
            "source_fetched_at": datetime(2026, 3, 1, tzinfo=timezone.utc),
            "dataset_type": "public-fpl",
            "is_test_fixture": True,
            "fixture_description": "isolated double-gameweek regression fixture",
            "pipeline_run_id": "test",
            "silver_transformed_at": datetime(2026, 3, 1, tzinfo=timezone.utc),
        }
        history = self.spark.createDataFrame(
            [
                {**common_history, "fixture_id": 10, "gameweek_id": 1, "kickoff_time": datetime(2025, 8, 2, tzinfo=timezone.utc), "total_points": 2},
                {**common_history, "fixture_id": 11, "gameweek_id": 1, "kickoff_time": datetime(2025, 8, 5, tzinfo=timezone.utc), "total_points": 3},
                {**common_history, "fixture_id": 12, "gameweek_id": 2, "kickoff_time": datetime(2025, 8, 10, tzinfo=timezone.utc), "total_points": 4},
            ]
        )
        players = self.spark.createDataFrame(
            [("s" * 64, 1, "Public Player", "GK")],
            ("source_snapshot_hash", "player_id", "player_name", "position"),
        )
        fixtures = self.spark.createDataFrame(
            [("s" * 64, 10, 1, 1, 2), ("s" * 64, 11, 1, 1, 2), ("s" * 64, 12, 2, 1, 2)],
            ("source_snapshot_hash", "fixture_id", "gameweek_id", "team_h_id", "team_a_id"),
        )
        gameweeks = self.spark.createDataFrame(
            [
                ("s" * 64, 1, datetime(2025, 8, 1, tzinfo=timezone.utc)),
                ("s" * 64, 2, datetime(2025, 8, 8, tzinfo=timezone.utc)),
            ],
            ("source_snapshot_hash", "gameweek_id", "deadline_time"),
        )
        features, outcomes = build_historical_player_gameweek_tables(history, players, fixtures, gameweeks)
        gameweek_one = outcomes.filter(F.col("gameweek_id") == 1).first()
        gameweek_two = features.filter(F.col("gameweek_id") == 2).first()
        self.assertEqual(gameweek_one.fixture_count, 2)
        self.assertEqual(gameweek_one.actual_points, 5.0)
        self.assertEqual(gameweek_two.completed_gameweeks, 1)
        self.assertEqual(gameweek_two.rolling_points_average, 5.0)

    def test_evaluation_rejects_outcome_columns_in_features(self) -> None:
        gold = build_gold_tables(self.silver)
        leaked_features = gold["gold_historical_player_gameweek_features"].withColumn(
            "actual_points", F.lit(99.0)
        )
        with self.assertRaisesRegex(ValueError, "outcome columns"):
            build_evaluation_tables(
                leaked_features,
                gold["gold_historical_player_gameweek_outcomes"],
                evaluation_run_id="leak-test",
            )

    def test_evaluation_rejects_an_empty_walk_forward_result(self) -> None:
        gold = build_gold_tables(self.silver)
        with self.assertRaisesRegex(ValueError, "no prediction rows"):
            build_evaluation_tables(
                gold["gold_historical_player_gameweek_features"].filter(F.lit(False)),
                gold["gold_historical_player_gameweek_outcomes"].filter(F.lit(False)),
                evaluation_run_id="empty-test",
            )

    def test_evaluation_metrics_calculate_mae_rmse_and_baseline(self) -> None:
        evaluated_at = datetime(2026, 7, 10, tzinfo=timezone.utc)
        predictions = self.spark.createDataFrame(
            [
                ("run", "s", "v", "public-fpl", False, "full public snapshot", "GK", 3, 2.0, 1.0, 3.0, evaluated_at),
                ("run", "s", "v", "public-fpl", False, "full public snapshot", "GK", 4, 4.0, 5.0, 2.0, evaluated_at),
            ],
            (
                "evaluation_run_id",
                "source_snapshot_hash",
                "model_version",
                "dataset_type",
                "is_test_fixture",
                "fixture_description",
                "position",
                "gameweek_id",
                "actual_points",
                "expected_points",
                "baseline_expected_points",
                "evaluated_at",
            ),
        )
        metrics = build_metrics_table(predictions).filter(F.col("segment_type") == "overall")
        by_variant = {row.model_variant: row for row in metrics.collect()}
        self.assertEqual(by_variant[MODEL_VARIANT].prediction_count, 2)
        self.assertEqual(by_variant[MODEL_VARIANT].mae, 1.0)
        self.assertEqual(by_variant[MODEL_VARIANT].rmse, 1.0)
        self.assertEqual(by_variant[BASELINE_VARIANT].mae, 1.5)
        self.assertAlmostEqual(by_variant[BASELINE_VARIANT].rmse, 1.5811, places=4)

    def test_malformed_snapshot_counts_and_identifiers_fail(self) -> None:
        snapshot = read_public_snapshot(self.spark, str(PUBLIC_FIXTURE))
        snapshot["players"] = snapshot["players"].withColumn(
            "id", F.when(F.col("id") == 1, F.lit(None).cast("int")).otherwise(F.col("id"))
        )
        with self.assertRaisesRegex(ValueError, "identifiers"):
            validate_public_snapshot(snapshot)


if __name__ == "__main__":
    unittest.main()
