from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from datetime import datetime, timezone

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    BooleanType,
    DoubleType,
    IntegerType,
    LongType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)

try:
    from scoutiq_databricks import MODEL_VERSION, PIPELINE_NAME
    from scoutiq_databricks.common import (
        BRONZE_TABLE_KEYS,
        EVALUATION_TABLE_KEYS,
        GOLD_TABLE_KEYS,
        SILVER_TABLE_KEYS,
        add_common_task_arguments,
        get_spark,
        load_tables,
        merge_delta_table,
        print_task_summary,
    )
except ModuleNotFoundError:  # Python-file tasks execute this file outside package mode.
    import sys
    from pathlib import Path

    source_file = globals().get("__file__") or globals().get("filename")
    if not source_file:
        raise RuntimeError("Unable to resolve the ScoutIQ source root for this Python-file task")
    sys.path.insert(0, str(Path(str(source_file)).resolve().parents[1]))
    from scoutiq_databricks import MODEL_VERSION, PIPELINE_NAME
    from scoutiq_databricks.common import (
        BRONZE_TABLE_KEYS,
        EVALUATION_TABLE_KEYS,
        GOLD_TABLE_KEYS,
        SILVER_TABLE_KEYS,
        add_common_task_arguments,
        get_spark,
        load_tables,
        merge_delta_table,
        print_task_summary,
    )

MODEL_VARIANT = "rule_based_expected_points"
BASELINE_VARIANT = "recent_points_baseline"

RUN_SUMMARY_SCHEMA = StructType(
    [
        StructField("pipeline_run_id", StringType(), False),
        StructField("evaluation_run_id", StringType(), False),
        StructField("source_snapshot_hash", StringType(), False),
        StructField("dataset_type", StringType(), False),
        StructField("is_test_fixture", BooleanType(), False),
        StructField("fixture_description", StringType(), True),
        StructField("model_version", StringType(), False),
        StructField("status", StringType(), False),
        StructField("completed_at", TimestampType(), False),
        StructField("table_counts_json", StringType(), False),
        StructField("evaluation_prediction_count", LongType(), False),
        StructField("evaluation_metric_row_count", LongType(), False),
        StructField("evaluated_gameweek_count", LongType(), False),
        StructField("first_evaluated_gameweek", IntegerType(), True),
        StructField("last_evaluated_gameweek", IntegerType(), True),
        StructField("mae", DoubleType(), True),
        StructField("rmse", DoubleType(), True),
        StructField("mean_error", DoubleType(), True),
        StructField("baseline_mae", DoubleType(), True),
        StructField("baseline_rmse", DoubleType(), True),
        StructField("baseline_mean_error", DoubleType(), True),
    ]
)


def build_evaluation_tables(
    features: DataFrame,
    outcomes: DataFrame,
    *,
    evaluation_run_id: str,
    min_training_gameweeks: int = 2,
) -> tuple[DataFrame, DataFrame]:
    if min_training_gameweeks < 1:
        raise ValueError("min_training_gameweeks must be at least 1")
    forbidden_feature_columns = {"actual_points", "actual_minutes", "target_points", "target_minutes"}
    leaked = sorted(forbidden_feature_columns.intersection(features.columns))
    if leaked:
        raise ValueError(f"Gold features contain outcome columns: {leaked}")

    keys = ("source_snapshot_hash", "season", "gameweek_id", "player_id")
    joined = features.alias("feature").join(
        outcomes.select(*keys, "fixture_count", "actual_points", "actual_minutes").alias("outcome"),
        [F.col(f"feature.{key}") == F.col(f"outcome.{key}") for key in keys],
        "inner",
    ).select(
        "feature.*",
        F.col("outcome.fixture_count"),
        F.col("outcome.actual_points"),
        F.col("outcome.actual_minutes"),
    )
    valid = joined.filter(
        (F.col("completed_gameweeks") >= min_training_gameweeks)
        & F.col("rolling_points_average").isNotNull()
        & F.col("season_points_average").isNotNull()
        & F.col("rolling_minutes_average").isNotNull()
        & F.col("performance_features_use_only_prior_gameweeks")
    )

    minutes_factor = (
        F.when(F.col("rolling_minutes_average") >= 70, F.lit(1.0))
        .when(F.col("rolling_minutes_average") >= 45, F.lit(0.85))
        .when(F.col("rolling_minutes_average") >= 20, F.lit(0.65))
        .otherwise(F.lit(0.45))
    )
    blended_points = (
        F.lit(0.55) * F.col("rolling_points_average")
        + F.lit(0.30) * F.col("season_points_average")
        + F.lit(0.15) * F.col("points_per_game")
    )
    scored = (
        valid.withColumn(
            "uncalibrated_expected_points",
            F.greatest(F.lit(0.0), blended_points * minutes_factor),
        )
        .withColumn(
            "uncalibrated_error",
            F.col("actual_points") - F.col("uncalibrated_expected_points"),
        )
        .withColumn(
            "baseline_expected_points",
            F.greatest(F.lit(0.0), F.col("rolling_points_average")),
        )
    )

    correction_keys = ("source_snapshot_hash", "season", "gameweek_id", "position")
    targets = scored.select(*correction_keys).distinct()
    prior_position = targets.alias("target").join(
        scored.select(
            "source_snapshot_hash",
            "season",
            "gameweek_id",
            "position",
            "uncalibrated_error",
        ).alias("prior"),
        (F.col("target.source_snapshot_hash") == F.col("prior.source_snapshot_hash"))
        & (F.col("target.season") == F.col("prior.season"))
        & (F.col("target.position") == F.col("prior.position"))
        & (F.col("prior.gameweek_id") < F.col("target.gameweek_id")),
        "left",
    ).groupBy(*[F.col(f"target.{key}") for key in correction_keys]).agg(
        F.countDistinct("prior.gameweek_id").alias("position_training_gameweek_count"),
        F.count("prior.uncalibrated_error").alias("position_training_row_count"),
        F.avg("prior.uncalibrated_error").alias("position_correction"),
    )

    global_targets = scored.select("source_snapshot_hash", "season", "gameweek_id").distinct()
    prior_global = global_targets.alias("target").join(
        scored.select(
            "source_snapshot_hash",
            "season",
            "gameweek_id",
            "uncalibrated_error",
        ).alias("prior"),
        (F.col("target.source_snapshot_hash") == F.col("prior.source_snapshot_hash"))
        & (F.col("target.season") == F.col("prior.season"))
        & (F.col("prior.gameweek_id") < F.col("target.gameweek_id")),
        "left",
    ).groupBy(
        F.col("target.source_snapshot_hash"),
        F.col("target.season"),
        F.col("target.gameweek_id"),
    ).agg(
        F.countDistinct("prior.gameweek_id").alias("training_gameweek_count"),
        F.count("prior.uncalibrated_error").alias("training_row_count"),
        F.avg("prior.uncalibrated_error").alias("global_correction"),
    )

    calibrated = scored.alias("scored").join(
        prior_position.alias("position_correction"),
        [F.col(f"scored.{key}") == F.col(f"position_correction.{key}") for key in correction_keys],
        "left",
    ).join(
        prior_global.alias("global_correction"),
        (
            F.col("scored.source_snapshot_hash") == F.col("global_correction.source_snapshot_hash")
        )
        & (F.col("scored.season") == F.col("global_correction.season"))
        & (F.col("scored.gameweek_id") == F.col("global_correction.gameweek_id")),
        "left",
    ).filter(F.col("global_correction.training_gameweek_count") >= min_training_gameweeks)

    correction = F.greatest(
        F.lit(-2.0),
        F.least(
            F.lit(2.0),
            F.coalesce(
                F.col("position_correction.position_correction"),
                F.col("global_correction.global_correction"),
                F.lit(0.0),
            ),
        ),
    )
    predictions = calibrated.select(
        F.lit(evaluation_run_id).alias("evaluation_run_id"),
        F.col("scored.source_snapshot_hash"),
        F.col("scored.history_capture_hash"),
        F.col("scored.season"),
        F.col("scored.gameweek_id"),
        F.col("scored.player_id"),
        F.col("scored.player_name"),
        F.col("scored.position"),
        F.col("scored.fixture_count"),
        F.col("scored.actual_points"),
        F.col("scored.actual_minutes"),
        F.col("scored.uncalibrated_expected_points"),
        F.greatest(F.lit(0.0), F.col("scored.uncalibrated_expected_points") + correction).alias(
            "expected_points"
        ),
        F.col("scored.baseline_expected_points"),
        correction.alias("walk_forward_correction"),
        F.col("global_correction.training_gameweek_count"),
        F.col("global_correction.training_row_count"),
        F.col("position_correction.position_training_gameweek_count"),
        F.col("position_correction.position_training_row_count"),
        F.lit(MODEL_VERSION).alias("model_version"),
        F.array(
            F.lit("rolling_points_average"),
            F.lit("season_points_average"),
            F.lit("points_per_game"),
            F.lit("rolling_minutes_average"),
            F.lit("position"),
        ).alias("model_feature_columns"),
        F.col("scored.feature_cutoff_gameweek_id"),
        F.col("scored.dataset_type"),
        F.col("scored.is_test_fixture"),
        F.col("scored.fixture_description"),
        F.col("scored.pipeline_run_id"),
        F.current_timestamp().alias("evaluated_at"),
    ).withColumn(
        "model_error", F.col("expected_points") - F.col("actual_points")
    ).withColumn(
        "baseline_error", F.col("baseline_expected_points") - F.col("actual_points")
    )

    if not predictions.limit(1).count():
        raise ValueError("Walk-forward evaluation produced no prediction rows")
    metrics = build_metrics_table(predictions)
    return predictions, metrics


def build_metrics_table(predictions: DataFrame) -> DataFrame:
    frames: list[DataFrame] = []
    for variant, prediction_column in (
        (MODEL_VARIANT, "expected_points"),
        (BASELINE_VARIANT, "baseline_expected_points"),
    ):
        overall = _metric_aggregate(predictions, prediction_column).select(
            F.lit(variant).alias("model_variant"),
            F.lit("overall").alias("segment_type"),
            F.lit("all").alias("segment_value"),
            "*",
        )
        by_position = _metric_aggregate(
            predictions,
            prediction_column,
            group_columns=("position",),
        ).select(
            F.lit(variant).alias("model_variant"),
            F.lit("position").alias("segment_type"),
            F.col("position").alias("segment_value"),
            *[column for column in _metric_columns() if column != "position"],
        )
        frames.extend((overall, by_position))

    metrics = frames[0]
    for frame in frames[1:]:
        metrics = metrics.unionByName(frame)
    return metrics.select(
        "evaluation_run_id",
        "model_variant",
        "segment_type",
        "segment_value",
        "source_snapshot_hash",
        "model_version",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        F.when(F.col("is_test_fixture"), F.lit("public_subset_demonstration_fixture"))
        .otherwise(F.lit("full_public_fpl_history"))
        .alias("metric_provenance"),
        "prediction_count",
        "evaluated_gameweek_count",
        "first_evaluated_gameweek",
        "last_evaluated_gameweek",
        "mae",
        "rmse",
        "mean_error",
        "evaluated_at",
    )


def run(
    spark: SparkSession,
    *,
    catalog: str,
    schema: str,
    pipeline_run_id: str,
    min_training_gameweeks: int,
) -> dict[str, object]:
    gold = load_tables(spark, catalog, schema, GOLD_TABLE_KEYS)
    features = gold["gold_historical_player_gameweek_features"].filter(
        F.col("pipeline_run_id") == pipeline_run_id
    )
    outcomes = gold["gold_historical_player_gameweek_outcomes"].filter(
        F.col("pipeline_run_id") == pipeline_run_id
    )
    snapshot = features.select(
        "source_snapshot_hash", "dataset_type", "is_test_fixture", "fixture_description"
    ).distinct().collect()
    if len(snapshot) != 1:
        raise ValueError(f"Expected one evaluated snapshot for pipeline run {pipeline_run_id}, received {len(snapshot)}")
    snapshot_row = snapshot[0]
    predictions, metrics = build_evaluation_tables(
        features,
        outcomes,
        evaluation_run_id=pipeline_run_id,
        min_training_gameweeks=min_training_gameweeks,
    )
    merge_delta_table(
        spark,
        predictions,
        catalog,
        schema,
        "analytics_expected_points_predictions",
        EVALUATION_TABLE_KEYS["analytics_expected_points_predictions"],
    )
    merge_delta_table(
        spark,
        metrics,
        catalog,
        schema,
        "analytics_expected_points_metrics",
        EVALUATION_TABLE_KEYS["analytics_expected_points_metrics"],
    )

    all_table_names = tuple(BRONZE_TABLE_KEYS) + tuple(SILVER_TABLE_KEYS) + tuple(GOLD_TABLE_KEYS)
    all_tables = load_tables(spark, catalog, schema, all_table_names)
    table_count_values = {
        table_name: dataframe.filter(F.col("source_snapshot_hash") == snapshot_row.source_snapshot_hash).count()
        for table_name, dataframe in all_tables.items()
    }
    prediction_count = predictions.count()
    metric_count = metrics.count()
    table_count_values.update(
        {
            "analytics_expected_points_predictions": prediction_count,
            "analytics_expected_points_metrics": metric_count,
        }
    )

    overall_rows = {
        row.model_variant: row
        for row in metrics.filter(F.col("segment_type") == "overall").collect()
    }
    model_metrics = overall_rows[MODEL_VARIANT]
    baseline_metrics = overall_rows[BASELINE_VARIANT]
    summary_values = (
        pipeline_run_id,
        pipeline_run_id,
        snapshot_row.source_snapshot_hash,
        snapshot_row.dataset_type,
        bool(snapshot_row.is_test_fixture),
        snapshot_row.fixture_description,
        MODEL_VERSION,
        "SUCCEEDED",
        datetime.now(timezone.utc),
        json.dumps(table_count_values, sort_keys=True),
        prediction_count,
        metric_count,
        model_metrics.evaluated_gameweek_count,
        model_metrics.first_evaluated_gameweek,
        model_metrics.last_evaluated_gameweek,
        model_metrics.mae,
        model_metrics.rmse,
        model_metrics.mean_error,
        baseline_metrics.mae,
        baseline_metrics.rmse,
        baseline_metrics.mean_error,
    )
    summary = spark.createDataFrame([summary_values], RUN_SUMMARY_SCHEMA)
    merge_delta_table(
        spark,
        summary,
        catalog,
        schema,
        "analytics_pipeline_run_summary",
        EVALUATION_TABLE_KEYS["analytics_pipeline_run_summary"],
    )

    result: dict[str, object] = {
        "pipeline_run_id": pipeline_run_id,
        "source_snapshot_hash": snapshot_row.source_snapshot_hash,
        "dataset_type": snapshot_row.dataset_type,
        "is_test_fixture": bool(snapshot_row.is_test_fixture),
        "table_counts": table_count_values,
        "evaluation_prediction_count": prediction_count,
        "evaluation_metric_row_count": metric_count,
        "mae": model_metrics.mae,
        "rmse": model_metrics.rmse,
        "mean_error": model_metrics.mean_error,
        "baseline_mae": baseline_metrics.mae,
        "baseline_rmse": baseline_metrics.rmse,
        "baseline_mean_error": baseline_metrics.mean_error,
        "evaluated_gameweek_count": model_metrics.evaluated_gameweek_count,
        "first_evaluated_gameweek": model_metrics.first_evaluated_gameweek,
        "last_evaluated_gameweek": model_metrics.last_evaluated_gameweek,
    }
    print_task_summary("evaluation", catalog=catalog, schema=schema, **result)
    return result


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run leakage-aware ScoutIQ expected-points evaluation.")
    add_common_task_arguments(parser)
    parser.add_argument("--min-training-gameweeks", type=int, default=2)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    spark = get_spark(f"{PIPELINE_NAME}-evaluation")
    run(
        spark,
        catalog=args.catalog,
        schema=args.schema,
        pipeline_run_id=args.pipeline_run_id,
        min_training_gameweeks=args.min_training_gameweeks,
    )
    return 0


def _metric_aggregate(
    predictions: DataFrame,
    prediction_column: str,
    group_columns: Sequence[str] = (),
) -> DataFrame:
    error = F.col(prediction_column) - F.col("actual_points")
    return predictions.groupBy(*group_columns).agg(
        F.first("evaluation_run_id").alias("evaluation_run_id"),
        F.first("source_snapshot_hash").alias("source_snapshot_hash"),
        F.first("model_version").alias("model_version"),
        F.first("dataset_type").alias("dataset_type"),
        F.first("is_test_fixture").alias("is_test_fixture"),
        F.first("fixture_description").alias("fixture_description"),
        F.count(F.lit(1)).alias("prediction_count"),
        F.countDistinct("gameweek_id").alias("evaluated_gameweek_count"),
        F.min("gameweek_id").alias("first_evaluated_gameweek"),
        F.max("gameweek_id").alias("last_evaluated_gameweek"),
        F.round(F.avg(F.abs(error)), 4).alias("mae"),
        F.round(F.sqrt(F.avg(error * error)), 4).alias("rmse"),
        F.round(F.avg(error), 4).alias("mean_error"),
        F.max("evaluated_at").alias("evaluated_at"),
    )


def _metric_columns() -> tuple[str, ...]:
    return (
        "position",
        "evaluation_run_id",
        "source_snapshot_hash",
        "model_version",
        "dataset_type",
        "is_test_fixture",
        "fixture_description",
        "prediction_count",
        "evaluated_gameweek_count",
        "first_evaluated_gameweek",
        "last_evaluated_gameweek",
        "mae",
        "rmse",
        "mean_error",
        "evaluated_at",
    )


if __name__ == "__main__":
    main()
