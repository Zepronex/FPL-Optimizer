from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from pipelines.databricks.io import write_local_tables
from pipelines.databricks.transforms import (
    GOLD_TABLE_COLUMNS,
    SILVER_TABLE_COLUMNS,
    build_bronze_tables,
    build_gold_tables,
    build_silver_tables,
    dataset_snapshot_hash,
    read_ingestion_dataset,
    validate_ingestion_dataset
)


class DatabricksPipelineTransformTests(unittest.TestCase):
    def test_snapshot_hash_is_stable_across_input_order(self) -> None:
        dataset = sample_dataset()
        reordered = {
            **dataset,
            'players': list(reversed(dataset['players'])),
            'teams': list(reversed(dataset['teams'])),
            'events': list(reversed(dataset['events'])),
            'fixtures': list(reversed(dataset['fixtures']))
        }

        self.assertEqual(dataset_snapshot_hash(dataset), dataset_snapshot_hash(reordered))

    def test_bronze_preserves_manifest_and_raw_records_with_metadata(self) -> None:
        dataset = sample_dataset()
        snapshot_hash = dataset_snapshot_hash(dataset)

        bronze = build_bronze_tables(dataset, loaded_at='2026-07-02T10:00:00Z')

        self.assertEqual(bronze['ingestion_manifest'][0]['snapshot_hash'], snapshot_hash)
        self.assertEqual(bronze['source_metadata'][0]['source_name'], 'bootstrap-static')
        self.assertEqual(bronze['players_raw'][0]['source_snapshot_hash'], snapshot_hash)
        self.assertEqual(
            json.loads(bronze['players_raw'][0]['raw_record_json'])['displayName'],
            'Alpha Forward'
        )

    def test_silver_tables_use_clean_typed_contracts(self) -> None:
        silver = build_silver_tables(sample_dataset())

        self.assertEqual(tuple(silver['players'][0].keys()), SILVER_TABLE_COLUMNS['players'])
        self.assertEqual(silver['players'][0]['price'], 12.5)
        self.assertEqual(silver['players'][0]['team_name'], 'Arsenal')
        self.assertEqual(tuple(silver['fixtures'][0].keys()), SILVER_TABLE_COLUMNS['fixtures'])
        self.assertIsNone(silver['fixtures'][0]['team_h_score'])
        self.assertIsNone(silver['fixtures'][0]['team_a_score'])

    def test_gold_player_features_are_prepared_without_outcome_columns(self) -> None:
        silver = build_silver_tables(sample_dataset())
        gold = build_gold_tables(silver)

        self.assertEqual(
            tuple(gold['player_gameweek_features'][0].keys()),
            GOLD_TABLE_COLUMNS['player_gameweek_features']
        )
        self.assertEqual(len(gold['player_gameweek_features']), 2)
        alpha = gold['player_gameweek_features'][0]
        self.assertEqual(alpha['player_id'], 1)
        self.assertEqual(alpha['team_name'], 'Arsenal')
        self.assertEqual(alpha['upcoming_gameweek_id'], 2)
        self.assertEqual(alpha['home_away'], 'H')
        self.assertEqual(alpha['fixture_difficulty'], 2)
        self.assertEqual(alpha['recent_points_average'], 6.2)
        self.assertEqual(alpha['season_points_average'], 7.1)
        self.assertEqual(alpha['season_minutes_average'], 0.0)
        self.assertEqual(alpha['rolling_points_average'], 6.2)
        self.assertEqual(alpha['rolling_minutes_average'], 0.0)
        self.assertNotIn('team_h_score', alpha)
        self.assertNotIn('team_a_score', alpha)
        self.assertNotIn('target_points', alpha)

    def test_validation_rejects_manifest_count_mismatch(self) -> None:
        dataset = sample_dataset()
        dataset['manifest'] = {
            **dataset['manifest'],
            'recordCounts': {
                **dataset['manifest']['recordCounts'],
                'players': 99
            }
        }

        with self.assertRaisesRegex(ValueError, 'Manifest counts do not match normalized files'):
            validate_ingestion_dataset(dataset)

    def test_local_writer_outputs_dry_run_jsonl_sample(self) -> None:
        tables = build_gold_tables(build_silver_tables(sample_dataset()))
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = write_local_tables(
                'gold',
                tables,
                temp_dir,
                dry_run=True,
                sample_limit=1
            )

            feature_file = output_dir / 'player_gameweek_features' / 'part-00000.jsonl'
            rows = feature_file.read_text(encoding='utf-8').strip().splitlines()
            self.assertEqual(len(rows), 1)
            self.assertTrue((output_dir / '_manifest.json').exists())

    def test_reads_day_two_ingestion_file_layout(self) -> None:
        dataset = sample_dataset()
        with tempfile.TemporaryDirectory() as temp_dir:
            input_dir = Path(temp_dir)
            file_map = {
                'manifest.json': dataset['manifest'],
                'players.json': dataset['players'],
                'teams.json': dataset['teams'],
                'events.json': dataset['events'],
                'fixtures.json': dataset['fixtures']
            }
            for file_name, value in file_map.items():
                (input_dir / file_name).write_text(
                    f'{json.dumps(value, indent=2)}\n',
                    encoding='utf-8'
                )

            loaded = read_ingestion_dataset(input_dir)

        self.assertEqual(loaded['manifest']['schemaVersion'], 1)
        self.assertEqual(len(loaded['players']), 2)


def sample_dataset() -> dict[str, object]:
    return {
        'manifest': {
            'schemaVersion': 1,
            'season': '2026-27',
            'generatedAt': '2026-07-02T10:00:00.000Z',
            'currentEventId': 1,
            'sources': [
                {
                    'name': 'bootstrap-static',
                    'url': 'https://fantasy.premierleague.com/api/bootstrap-static/',
                    'fetchedAt': '2026-07-02T09:59:58.000Z',
                    'httpDate': None,
                    'etag': 'abc123',
                    'lastModified': None
                },
                {
                    'name': 'fixtures',
                    'url': 'https://fantasy.premierleague.com/api/fixtures/',
                    'fetchedAt': '2026-07-02T09:59:59.000Z',
                    'httpDate': None,
                    'etag': None,
                    'lastModified': None
                }
            ],
            'recordCounts': {
                'players': 2,
                'teams': 2,
                'events': 2,
                'fixtures': 1
            }
        },
        'players': [
            {
                'id': 1,
                'code': 100,
                'firstName': 'Alpha',
                'secondName': 'Forward',
                'webName': 'Alpha',
                'displayName': 'Alpha Forward',
                'teamId': 1,
                'position': 'FWD',
                'nowCost': 12.5,
                'status': 'a',
                'chanceOfPlayingNextRound': 100,
                'chanceOfPlayingThisRound': 100,
                'form': 6.2,
                'selectedByPercent': 42.5,
                'pointsPerGame': 7.1,
                'valueSeason': 12.8,
                'totalPoints': 181,
                'minutes': 2420,
                'starts': 28,
                'expectedGoals': 19.45,
                'expectedAssists': 7.15,
                'expectedGoalInvolvements': 26.6,
                'expectedGoalsConceded': 24.0
            },
            {
                'id': 2,
                'code': 200,
                'firstName': 'Beta',
                'secondName': 'Keeper',
                'webName': 'Keeper',
                'displayName': 'Beta Keeper',
                'teamId': 20,
                'position': 'GK',
                'nowCost': 4.5,
                'status': 'd',
                'chanceOfPlayingNextRound': 75,
                'chanceOfPlayingThisRound': 50,
                'form': 0.0,
                'selectedByPercent': 2.5,
                'pointsPerGame': 1.1,
                'valueSeason': 4.8,
                'totalPoints': 11,
                'minutes': 450,
                'starts': 5,
                'expectedGoals': 0.0,
                'expectedAssists': 0.0,
                'expectedGoalInvolvements': 0.0,
                'expectedGoalsConceded': 7.5
            }
        ],
        'teams': [
            {
                'id': 1,
                'code': 1,
                'name': 'Arsenal',
                'shortName': 'ARS',
                'strength': 5,
                'strengthOverallHome': 1350,
                'strengthOverallAway': 1320
            },
            {
                'id': 20,
                'code': 20,
                'name': 'Wolves',
                'shortName': 'WOL',
                'strength': 3,
                'strengthOverallHome': 1040,
                'strengthOverallAway': 1010
            }
        ],
        'events': [
            {
                'id': 1,
                'name': 'Gameweek 1',
                'deadlineTime': '2026-08-14T17:30:00.000Z',
                'averageEntryScore': 55,
                'highestScore': 112,
                'finished': False,
                'dataChecked': False,
                'isCurrent': True,
                'isNext': False
            },
            {
                'id': 2,
                'name': 'Gameweek 2',
                'deadlineTime': '2026-08-21T17:30:00.000Z',
                'averageEntryScore': None,
                'highestScore': None,
                'finished': False,
                'dataChecked': False,
                'isCurrent': False,
                'isNext': True
            }
        ],
        'fixtures': [
            {
                'id': 10,
                'code': 10,
                'eventId': 2,
                'kickoffTime': '2026-08-22T11:30:00.000Z',
                'teamHId': 1,
                'teamAId': 20,
                'teamHScore': None,
                'teamAScore': None,
                'teamHDifficulty': 2,
                'teamADifficulty': 4,
                'started': False,
                'finished': False
            }
        ]
    }


if __name__ == '__main__':
    unittest.main()
