#!/usr/bin/env python3
"""Generate provenance-bearing, résumé-safe metrics from local ScoutIQ artifacts.

This script deliberately reports null values when the canonical artifact is absent.
It never substitutes fixture values, test fixtures, README prose, or a live API response.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import hmac
import json
import math
import os
import stat
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO, Iterator, Sequence


MAX_ARTIFACT_BYTES = 64 * 1024 * 1024
MAX_JSONL_LINE_BYTES = 64 * 1024
MAX_JSONL_ROWS = 100_000
HASH_CHUNK_BYTES = 1024 * 1024
SHA256_HEX_LENGTH = 64
PACKAGED_FILENAMES = (
    'manifest.json',
    'players.json',
    'teams.json',
    'events.json',
    'fixtures.json',
    'player_gameweek_history.json'
)
RECORD_COUNT_LIMITS = {
    'players': 2_000,
    'teams': 100,
    'events': 100,
    'fixtures': 5_000,
    'historyRows': 400_000
}


def read_json_artifact(path: Path) -> tuple[dict[str, Any], str] | None:
    if not artifact_exists(path):
        return None
    value, digest = capture_strict_json_artifact(path)
    if not isinstance(value, dict):
        raise ValueError(f'Expected a JSON object in {path.name}')
    return value, digest


def capture_strict_json_artifact(path: Path) -> tuple[Any, str]:
    digest = hashlib.sha256()
    chunks: list[bytes] = []
    bytes_read = 0
    with open_bounded_artifact(path) as (source, opened_stats):
        while chunk := source.read(HASH_CHUNK_BYTES):
            bytes_read += len(chunk)
            if bytes_read > MAX_ARTIFACT_BYTES:
                raise ValueError(f'Artifact exceeds its byte limit: {path.name}')
            digest.update(chunk)
            chunks.append(chunk)
        if bytes_read != opened_stats.st_size:
            raise ValueError(f'Artifact changed or exceeded its byte limit: {path.name}')
    contents = b''.join(chunks)
    try:
        value = strict_json_loads(contents.decode('utf-8', errors='strict'))
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        raise ValueError(f'Invalid strict JSON artifact: {path.name}') from None
    return value, digest.hexdigest()


def count_jsonl_rows_with_sha(path: Path) -> tuple[int, str] | None:
    if not artifact_exists(path):
        return None
    row_count = 0
    bytes_read = 0
    digest = hashlib.sha256()
    with open_bounded_artifact(path) as (source, opened_stats):
        for line_number, encoded_line in enumerate(source, start=1):
            bytes_read += len(encoded_line)
            if bytes_read > MAX_ARTIFACT_BYTES:
                raise ValueError(f'Artifact exceeds its byte limit: {path.name}')
            digest.update(encoded_line)
            if len(encoded_line.rstrip(b'\r\n')) > MAX_JSONL_LINE_BYTES:
                raise ValueError(f'JSONL line exceeds its byte limit in {path.name}')
            if not encoded_line.strip():
                continue
            if row_count >= MAX_JSONL_ROWS:
                raise ValueError(f'JSONL artifact exceeds its row limit: {path.name}')
            try:
                value = strict_json_loads(encoded_line.decode('utf-8', errors='strict'))
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
                raise ValueError(f'Invalid strict JSON in {path.name} at line {line_number}') from None
            if not isinstance(value, dict):
                raise ValueError(f'JSONL rows must be objects in {path.name}')
            row_count += 1
        if bytes_read != opened_stats.st_size:
            raise ValueError(f'Artifact changed while it was being read: {path.name}')
    return row_count, digest.hexdigest()


def artifact_exists(path: Path) -> bool:
    try:
        path.lstat()
    except FileNotFoundError:
        return False
    except OSError:
        raise ValueError(f'Unable to inspect local artifact: {path.name}') from None
    return True


@contextlib.contextmanager
def open_bounded_artifact(path: Path) -> Iterator[tuple[BinaryIO, os.stat_result]]:
    try:
        initial_stats = path.lstat()
    except FileNotFoundError:
        raise FileNotFoundError(f'Missing local artifact: {path.name}') from None
    except OSError:
        raise ValueError(f'Unable to inspect local artifact: {path.name}') from None
    if not stat.S_ISREG(initial_stats.st_mode):
        raise ValueError(f'Artifact must be a regular non-symlink file: {path.name}')
    if initial_stats.st_size > MAX_ARTIFACT_BYTES:
        raise ValueError(f'Artifact exceeds its byte limit: {path.name}')

    open_flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    try:
        descriptor = os.open(path, open_flags)
    except OSError:
        raise ValueError(f'Unable to open artifact safely: {path.name}') from None

    try:
        with os.fdopen(descriptor, 'rb') as source:
            opened_stats = os.fstat(source.fileno())
            if (
                not stat.S_ISREG(opened_stats.st_mode)
                or (initial_stats.st_dev, initial_stats.st_ino) != (opened_stats.st_dev, opened_stats.st_ino)
                or opened_stats.st_size > MAX_ARTIFACT_BYTES
            ):
                raise ValueError(f'Artifact changed or exceeded its byte limit: {path.name}')
            yield source, opened_stats
            final_stats = os.fstat(source.fileno())
            try:
                final_path_stats = path.lstat()
            except OSError:
                raise ValueError(f'Artifact changed while it was being read: {path.name}') from None
    except ValueError:
        raise
    except OSError:
        raise ValueError(f'Unable to read artifact safely: {path.name}') from None

    if (
        not stat.S_ISREG(final_path_stats.st_mode)
        or (opened_stats.st_dev, opened_stats.st_ino) != (final_path_stats.st_dev, final_path_stats.st_ino)
        or final_stats.st_size > MAX_ARTIFACT_BYTES
        or (opened_stats.st_size, opened_stats.st_mtime_ns, opened_stats.st_ctime_ns)
        != (final_stats.st_size, final_stats.st_mtime_ns, final_stats.st_ctime_ns)
    ):
        raise ValueError(f'Artifact changed or exceeded its byte limit: {path.name}')


def strict_json_loads(value: str) -> Any:
    return json.loads(
        value,
        parse_constant=reject_json_constant,
        parse_float=parse_finite_float,
        object_pairs_hook=unique_json_object
    )


def reject_json_constant(_value: str) -> None:
    raise ValueError('Non-standard JSON numeric constants are not allowed')


def parse_finite_float(value: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed):
        raise ValueError('JSON numbers must be finite')
    return parsed


def unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('Duplicate JSON object keys are not allowed')
        value[key] = item
    return value


def validate_total_artifact_budget(paths: Sequence[Path]) -> None:
    total_bytes = 0
    for path in paths:
        if not artifact_exists(path):
            continue
        try:
            metadata = path.lstat()
        except OSError:
            raise ValueError(f'Unable to inspect local artifact: {path.name}') from None
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError(f'Artifact must be a regular non-symlink file: {path.name}')
        total_bytes += metadata.st_size
        if total_bytes > MAX_ARTIFACT_BYTES:
            raise ValueError('Local résumé metric artifacts exceed the aggregate byte limit')


def validate_snapshot_metadata(
    metadata: dict[str, Any],
    snapshot_dir: Path
) -> tuple[dict[str, int], dict[str, str]]:
    if metadata.get('hashAlgorithm') != 'SHA-256':
        raise ValueError('Snapshot metadata must declare SHA-256')
    source_hash = require_sha256(metadata.get('sourceSnapshotHash'), 'sourceSnapshotHash')
    canonical_hash = require_sha256(metadata.get('canonicalSnapshotHash'), 'canonicalSnapshotHash')
    if not hmac.compare_digest(source_hash, canonical_hash):
        raise ValueError('Snapshot metadata source and canonical hashes do not match')

    file_hashes = metadata.get('fileSha256')
    if not isinstance(file_hashes, dict) or set(file_hashes) != set(PACKAGED_FILENAMES):
        raise ValueError('Snapshot metadata must contain the exact packaged file hashes')

    values: dict[str, Any] = {}
    normalized_file_hashes: dict[str, str] = {}
    for filename in PACKAGED_FILENAMES:
        expected_hash = require_sha256(file_hashes[filename], f'fileSha256.{filename}')
        normalized_file_hashes[filename] = expected_hash
        file_path = snapshot_dir / filename
        if not artifact_exists(file_path):
            raise ValueError(f'Missing packaged snapshot artifact: {filename}')
        value, actual_hash = capture_strict_json_artifact(file_path)
        if not hmac.compare_digest(expected_hash, actual_hash):
            raise ValueError(f'Packaged snapshot artifact hash does not match metadata: {filename}')
        values[filename] = value

    history_hash = require_sha256(metadata.get('historyCaptureHash'), 'historyCaptureHash')
    if not hmac.compare_digest(history_hash, normalized_file_hashes['player_gameweek_history.json']):
        raise ValueError('Snapshot metadata history hashes do not match')
    counts = require_record_counts(metadata.get('recordCounts'))
    expected_collections = {
        'players': 'players.json',
        'teams': 'teams.json',
        'events': 'events.json',
        'fixtures': 'fixtures.json'
    }
    if not isinstance(values['manifest.json'], dict):
        raise ValueError('Packaged snapshot manifest must be an object')
    manifest_counts = validate_manifest_counts(values['manifest.json'])
    if any(manifest_counts[name] != counts[name] for name in manifest_counts):
        raise ValueError('Packaged snapshot manifest counts do not match metadata')
    for count_name, filename in expected_collections.items():
        collection = values[filename]
        if not isinstance(collection, list) or len(collection) != counts[count_name]:
            raise ValueError(f'Packaged snapshot {count_name} count does not match metadata')

    history = values['player_gameweek_history.json']
    if not isinstance(history, dict):
        raise ValueError('Packaged player history must be an object')
    rows = history.get('rows')
    row_count = require_bounded_integer(
        history.get('rowCount'), 'history.rowCount', RECORD_COUNT_LIMITS['historyRows']
    )
    if not isinstance(rows, list) or len(rows) != row_count or row_count != counts['historyRows']:
        raise ValueError('Player history row count does not match snapshot metadata')
    return counts, normalized_file_hashes


def validate_manifest_counts(manifest: dict[str, Any]) -> dict[str, int]:
    raw_counts = manifest.get('recordCounts')
    if not isinstance(raw_counts, dict) or set(raw_counts) != {'players', 'teams', 'events', 'fixtures'}:
        raise ValueError('Manifest recordCounts must contain the supported counters')
    return {
        name: require_bounded_integer(raw_counts.get(name), f'manifest.recordCounts.{name}', limit)
        for name, limit in RECORD_COUNT_LIMITS.items()
        if name != 'historyRows'
    }


def require_record_counts(value: Any) -> dict[str, int]:
    if not isinstance(value, dict) or set(value) != set(RECORD_COUNT_LIMITS):
        raise ValueError('Snapshot metadata recordCounts must contain the supported counters')
    return {
        name: require_bounded_integer(value.get(name), f'recordCounts.{name}', limit)
        for name, limit in RECORD_COUNT_LIMITS.items()
    }


def require_bounded_integer(value: Any, label: str, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > maximum:
        raise ValueError(f'{label} must be a bounded nonnegative integer')
    return value


def require_nonnegative_metric(value: Any, label: str) -> float | int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{label} must be a finite nonnegative number')
    parsed = float(value)
    if not math.isfinite(parsed) or parsed < 0:
        raise ValueError(f'{label} must be a finite nonnegative number')
    return value


def require_sha256(value: Any, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != SHA256_HEX_LENGTH
        or any(character not in '0123456789abcdefABCDEF' for character in value)
    ):
        raise ValueError(f'{label} must be a SHA-256 hexadecimal digest')
    return value.lower()


def require_optional_short_string(value: Any, label: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value or len(value) > 40:
        raise ValueError(f'{label} must be a short string or null')
    return value


def generate_metrics(root: Path) -> dict[str, Any]:
    snapshot_dir = root / 'data' / 'fpl' / 'latest'
    manifest_path = snapshot_dir / 'manifest.json'
    databricks_snapshot_dir = root / 'data' / 'databricks' / 'public_fpl_snapshot'
    snapshot_metadata_path = databricks_snapshot_dir / 'snapshot_metadata.json'
    history_path = databricks_snapshot_dir / 'player_gameweek_history.json'
    training_rows_path = root / 'data' / 'features' / 'player_gameweek_training_rows.jsonl'
    backtest_path = root / 'data' / 'evaluation' / 'expected_points_backtest.json'
    artifact_paths = (
        manifest_path,
        snapshot_metadata_path,
        training_rows_path,
        backtest_path,
        *(databricks_snapshot_dir / filename for filename in PACKAGED_FILENAMES)
    )
    validate_total_artifact_budget(artifact_paths)
    manifest_artifact = read_json_artifact(manifest_path)
    metadata_artifact = read_json_artifact(snapshot_metadata_path)
    backtest_artifact = read_json_artifact(backtest_path)
    training_artifact = count_jsonl_rows_with_sha(training_rows_path)
    manifest = manifest_artifact[0] if manifest_artifact else None
    snapshot_metadata = metadata_artifact[0] if metadata_artifact else None
    backtest = backtest_artifact[0] if backtest_artifact else None

    if snapshot_metadata and not isinstance(snapshot_metadata.get('isTestFixture'), bool):
        raise ValueError('Snapshot metadata isTestFixture must be a boolean')
    if snapshot_metadata and snapshot_metadata.get('isTestFixture'):
        snapshot_metadata = None

    verified_package_hashes: dict[str, str] = {}
    if snapshot_metadata:
        snapshot_counts, verified_package_hashes = validate_snapshot_metadata(
            snapshot_metadata,
            databricks_snapshot_dir
        )
    else:
        snapshot_counts = validate_manifest_counts(manifest) if manifest else None

    prediction_count = require_bounded_integer(
        backtest.get('prediction_count'), 'backtest.prediction_count', MAX_JSONL_ROWS
    ) if backtest and backtest.get('prediction_count') is not None else None
    mae = require_nonnegative_metric(nested_value(backtest, 'metrics', 'mae'), 'backtest.metrics.mae')
    rmse = require_nonnegative_metric(nested_value(backtest, 'metrics', 'rmse'), 'backtest.metrics.rmse')
    baseline_mae = require_nonnegative_metric(
        nested_value(backtest, 'baseline_metrics', 'mae'), 'backtest.baseline_metrics.mae'
    )
    baseline_rmse = require_nonnegative_metric(
        nested_value(backtest, 'baseline_metrics', 'rmse'), 'backtest.baseline_metrics.rmse'
    )
    season = require_optional_short_string(
        snapshot_metadata.get('effectiveSeason') if snapshot_metadata else manifest.get('season') if manifest else None,
        'snapshot.season'
    )
    snapshot_hash = (
        require_sha256(snapshot_metadata.get('sourceSnapshotHash'), 'snapshot.sourceSnapshotHash')
        if snapshot_metadata
        else require_sha256(manifest.get('snapshotHash'), 'manifest.snapshotHash')
        if manifest and manifest.get('snapshotHash') is not None
        else None
    )

    metrics: dict[str, Any] = {
        'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'method': 'local_artifacts_only',
        'snapshot': {
            'season': season,
            'snapshot_hash': snapshot_hash,
            'players': snapshot_counts.get('players') if snapshot_counts else None,
            'teams': snapshot_counts.get('teams') if snapshot_counts else None,
            'gameweeks': snapshot_counts.get('events') if snapshot_counts else None,
            'fixtures': snapshot_counts.get('fixtures') if snapshot_counts else None,
            'history_rows': snapshot_counts.get('historyRows') if snapshot_counts else None,
            'provenance': provenance_from_digest(
                manifest_path, root, manifest_artifact[1] if manifest_artifact else None
            ),
            'snapshot_metadata_provenance': provenance_from_digest(
                snapshot_metadata_path, root, metadata_artifact[1] if metadata_artifact else None
            ),
            'history_provenance': provenance_from_digest(
                history_path,
                root,
                verified_package_hashes.get('player_gameweek_history.json')
            )
        },
        'training': {
            'player_gameweek_rows': training_artifact[0] if training_artifact else None,
            'provenance': provenance_from_digest(
                training_rows_path, root, training_artifact[1] if training_artifact else None
            )
        },
        'backtest': {
            'evaluated_rows': prediction_count,
            'mae': mae,
            'rmse': rmse,
            'baseline_mae': baseline_mae,
            'baseline_rmse': baseline_rmse,
            'provenance': provenance_from_digest(
                backtest_path, root, backtest_artifact[1] if backtest_artifact else None
            )
        }
    }
    metrics['warnings'] = missing_artifact_warnings(metrics)
    return metrics


def nested_value(value: dict[str, Any] | None, key: str, nested_key: str) -> Any:
    nested = value.get(key) if value else None
    return nested.get(nested_key) if isinstance(nested, dict) else None


def safe_relative_path(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.name


def provenance_from_digest(path: Path, root: Path, digest: str | None) -> dict[str, str] | None:
    if digest is None:
        return None
    return {'path': safe_relative_path(path, root), 'sha256': digest}


def missing_artifact_warnings(metrics: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    for section, label in (('snapshot', 'normalized FPL snapshot'), ('training', 'training rows'), ('backtest', 'backtest report')):
        if metrics[section]['provenance'] is None:
            warnings.append(f'{label} is absent; its metrics are intentionally null.')
    return warnings


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Generate résumé-safe ScoutIQ metrics from local artifacts.')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, default=Path('artifacts/resume_metrics.json'))
    args = parser.parse_args(argv)
    root = args.root.resolve()
    output = args.output if args.output.is_absolute() else root / args.output
    metrics = generate_metrics(root)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(metrics, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(f'Wrote résumé-safe metrics to {safe_relative_path(output, root)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
