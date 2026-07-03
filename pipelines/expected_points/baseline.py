from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pipelines.expected_points import MODEL_VERSION
from pipelines.expected_points.features import PREDICTION_FEATURE_COLUMNS, validate_prediction_feature_row, validate_training_feature_row

JsonObject = dict[str, Any]

MODEL_FEATURE_COLUMNS: tuple[str, ...] = (
    'price',
    'availability_status',
    'chance_of_playing_next_round',
    'form',
    'recent_points_average',
    'selected_by_percent',
    'completed_gameweeks',
    'season_points_average',
    'season_minutes_average',
    'rolling_points_average',
    'rolling_minutes_average',
    'points_per_game',
    'value_season',
    'fixture_difficulty',
    'home_away',
    'position'
)


@dataclass(frozen=True)
class RuleBasedExpectedPointsModel:
    model_version: str = MODEL_VERSION
    global_correction: float = 0.0
    position_corrections: dict[str, float] | None = None
    training_row_count: int = 0
    trained_from_gameweek: int | None = None
    trained_through_gameweek: int | None = None

    @classmethod
    def fit(cls, rows: list[JsonObject]) -> 'RuleBasedExpectedPointsModel':
        if not rows:
            raise ValueError('Cannot train expected-points baseline without rows')

        for row in rows:
            validate_training_feature_row(row)

        errors = [float(row['target_points']) - raw_expected_points(row) for row in rows]
        global_correction = clipped_mean(errors, lower=-2.0, upper=2.0)

        position_corrections: dict[str, float] = {}
        for position in ('GK', 'DEF', 'MID', 'FWD'):
            position_errors = [
                float(row['target_points']) - raw_expected_points(row)
                for row in rows
                if row['position'] == position
            ]
            position_corrections[position] = clipped_mean(position_errors, lower=-2.0, upper=2.0)

        gameweeks = sorted({int(row['upcoming_gameweek_id']) for row in rows})
        return cls(
            global_correction=round(global_correction, 4),
            position_corrections={key: round(value, 4) for key, value in position_corrections.items()},
            training_row_count=len(rows),
            trained_from_gameweek=gameweeks[0],
            trained_through_gameweek=gameweeks[-1]
        )

    @classmethod
    def from_dict(cls, value: JsonObject) -> 'RuleBasedExpectedPointsModel':
        return cls(
            model_version=str(value.get('model_version', MODEL_VERSION)),
            global_correction=float(value.get('global_correction', 0.0)),
            position_corrections={
                str(key): float(correction)
                for key, correction in dict(value.get('position_corrections') or {}).items()
            },
            training_row_count=int(value.get('training_row_count', 0)),
            trained_from_gameweek=optional_int(value.get('trained_from_gameweek')),
            trained_through_gameweek=optional_int(value.get('trained_through_gameweek'))
        )

    def to_dict(self) -> JsonObject:
        return {
            'model_version': self.model_version,
            'global_correction': self.global_correction,
            'position_corrections': self.position_corrections or {},
            'training_row_count': self.training_row_count,
            'trained_from_gameweek': self.trained_from_gameweek,
            'trained_through_gameweek': self.trained_through_gameweek,
            'feature_columns': list(MODEL_FEATURE_COLUMNS)
        }

    def predict_row(self, row: JsonObject) -> JsonObject:
        prediction_row = {column: row[column] for column in PREDICTION_FEATURE_COLUMNS}
        validate_prediction_feature_row(prediction_row)
        raw_prediction = raw_expected_points(prediction_row)
        correction = self.global_correction
        if self.position_corrections:
            correction = self.position_corrections.get(str(prediction_row['position']), correction)

        expected_points = max(0.0, raw_prediction + correction)
        return {
            'player_id': int(prediction_row['player_id']),
            'player_name': prediction_row['player_name'],
            'position': prediction_row['position'],
            'team_id': int(prediction_row['team_id']),
            'team_name': prediction_row['team_name'],
            'price': float(prediction_row['price']),
            'fixture_id': int(prediction_row['fixture_id']),
            'opponent_team_id': int(prediction_row['opponent_team_id']),
            'opponent_team': prediction_row['opponent_team'],
            'fixture_difficulty': int(prediction_row['fixture_difficulty']),
            'home_away': prediction_row['home_away'],
            'upcoming_gameweek_id': int(prediction_row['upcoming_gameweek_id']),
            'expected_points': round(expected_points, 4),
            'baseline_expected_points': round(simple_recent_average_prediction(prediction_row), 4),
            'model_version': self.model_version,
            'source_snapshot_hash': prediction_row['source_snapshot_hash'],
            'source_generated_at': prediction_row['source_generated_at'],
            'feature_columns': list(MODEL_FEATURE_COLUMNS)
        }

    def predict(self, rows: list[JsonObject]) -> list[JsonObject]:
        return [self.predict_row(row) for row in rows]


def raw_expected_points(row: JsonObject) -> float:
    recent_points = feature_value(row, 'rolling_points_average', 'recent_points_average', 'form')
    season_points = feature_value(row, 'season_points_average', 'points_per_game')
    points_per_game = feature_value(row, 'points_per_game', 'season_points_average')
    minutes_average = feature_value(row, 'rolling_minutes_average', 'season_minutes_average')

    blended_points = (0.55 * recent_points) + (0.30 * season_points) + (0.15 * points_per_game)
    minutes_factor = minutes_availability_factor(minutes_average)
    availability_factor = status_availability_factor(row)
    fixture_adjustment = (3 - int(row['fixture_difficulty'])) * 0.20
    home_adjustment = 0.10 if row['home_away'] == 'H' else -0.05

    return max(0.0, (blended_points * minutes_factor * availability_factor) + fixture_adjustment + home_adjustment)


def simple_recent_average_prediction(row: JsonObject) -> float:
    return max(0.0, feature_value(row, 'rolling_points_average', 'recent_points_average', 'form'))


def minutes_availability_factor(minutes_average: float) -> float:
    if minutes_average >= 70:
        return 1.0
    if minutes_average >= 45:
        return 0.85
    if minutes_average >= 20:
        return 0.65
    return 0.45


def status_availability_factor(row: JsonObject) -> float:
    chance = row.get('chance_of_playing_next_round')
    if isinstance(chance, (int, float)):
        return max(0.0, min(1.0, float(chance) / 100))
    if row['availability_status'] == 'a':
        return 1.0
    return 0.70


def feature_value(row: JsonObject, *columns: str) -> float:
    for column in columns:
        value = row.get(column)
        if isinstance(value, (int, float)):
            return float(value)
    return 0.0


def clipped_mean(values: list[float], *, lower: float, upper: float) -> float:
    if not values:
        return 0.0
    average = sum(values) / len(values)
    return max(lower, min(upper, average))


def optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)
