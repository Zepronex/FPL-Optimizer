from __future__ import annotations

import math
from typing import Any

from pipelines.expected_points.baseline import RuleBasedExpectedPointsModel
from pipelines.expected_points.features import validate_training_feature_row

JsonObject = dict[str, Any]


def split_train_test_for_gameweek(rows: list[JsonObject], target_gameweek_id: int) -> tuple[list[JsonObject], list[JsonObject]]:
    train_rows = [
        row
        for row in rows
        if int(row['upcoming_gameweek_id']) < target_gameweek_id
    ]
    test_rows = [
        row
        for row in rows
        if int(row['upcoming_gameweek_id']) == target_gameweek_id
    ]

    if train_rows and max(int(row['upcoming_gameweek_id']) for row in train_rows) >= target_gameweek_id:
        raise ValueError(f'Train split leaks target gameweek {target_gameweek_id}')

    return train_rows, test_rows


def walk_forward_backtest(
    rows: list[JsonObject],
    *,
    min_training_gameweeks: int = 2
) -> JsonObject:
    if min_training_gameweeks < 1:
        raise ValueError('min_training_gameweeks must be at least 1')

    for row in rows:
        validate_training_feature_row(row)

    sorted_rows = sorted(rows, key=lambda row: (int(row['upcoming_gameweek_id']), int(row['player_id']), int(row['fixture_id'])))
    predictions: list[JsonObject] = []
    skipped_gameweeks: list[int] = []

    for target_gameweek_id in sorted({int(row['upcoming_gameweek_id']) for row in sorted_rows}):
        train_rows, test_rows = split_train_test_for_gameweek(sorted_rows, target_gameweek_id)
        training_gameweeks = sorted({int(row['upcoming_gameweek_id']) for row in train_rows})
        if len(training_gameweeks) < min_training_gameweeks or not test_rows:
            skipped_gameweeks.append(target_gameweek_id)
            continue

        model = RuleBasedExpectedPointsModel.fit(train_rows)
        for test_row in test_rows:
            prediction = model.predict_row(test_row)
            predictions.append({
                **prediction,
                'actual_points': float(test_row['target_points']),
                'target_minutes': float(test_row['target_minutes']),
                'training_gameweeks': training_gameweeks,
                'training_row_count': len(train_rows)
            })

    report = {
        'metrics': calculate_prediction_metrics(predictions, prediction_column='expected_points'),
        'baseline_metrics': calculate_prediction_metrics(predictions, prediction_column='baseline_expected_points'),
        'metrics_by_position': calculate_metrics_by_position(predictions, prediction_column='expected_points'),
        'baseline_metrics_by_position': calculate_metrics_by_position(predictions, prediction_column='baseline_expected_points'),
        'evaluated_gameweeks': sorted({int(row['upcoming_gameweek_id']) for row in predictions}),
        'skipped_gameweeks': skipped_gameweeks,
        'prediction_count': len(predictions),
        'predictions': predictions
    }
    return report


def calculate_prediction_metrics(rows: list[JsonObject], *, prediction_column: str) -> JsonObject:
    if not rows:
        return {
            'count': 0,
            'mae': None,
            'rmse': None,
            'mean_error': None
        }

    errors = [
        float(row[prediction_column]) - float(row['actual_points'])
        for row in rows
    ]
    absolute_errors = [abs(error) for error in errors]
    squared_errors = [error * error for error in errors]
    return {
        'count': len(rows),
        'mae': round(sum(absolute_errors) / len(absolute_errors), 4),
        'rmse': round(math.sqrt(sum(squared_errors) / len(squared_errors)), 4),
        'mean_error': round(sum(errors) / len(errors), 4)
    }


def calculate_metrics_by_position(rows: list[JsonObject], *, prediction_column: str) -> dict[str, JsonObject]:
    metrics: dict[str, JsonObject] = {}
    for position in ('GK', 'DEF', 'MID', 'FWD'):
        position_rows = [row for row in rows if row['position'] == position]
        metrics[position] = calculate_prediction_metrics(position_rows, prediction_column=prediction_column)
    return metrics
