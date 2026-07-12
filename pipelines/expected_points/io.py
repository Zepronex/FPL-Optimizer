from __future__ import annotations

import json
import math
import os
import stat
from pathlib import Path
from typing import Any

from pipelines.databricks.transforms import stable_json_dumps

JsonObject = dict[str, Any]

MAX_JSONL_BYTES = 64 * 1024 * 1024
MAX_JSONL_LINE_BYTES = 64 * 1024
MAX_JSONL_ROWS = 100_000
MAX_MODEL_JSON_BYTES = 4 * 1024 * 1024


def read_jsonl(file_path: str | Path) -> list[JsonObject]:
    path = Path(file_path)
    contents = read_bounded_bytes(path, MAX_JSONL_BYTES, 'JSONL')
    rows: list[JsonObject] = []
    for line_number, encoded_line in enumerate(contents.splitlines(), start=1):
        if len(encoded_line) > MAX_JSONL_LINE_BYTES:
            raise ValueError(f'JSONL line exceeds its byte limit in {path.name}')
        if not encoded_line.strip():
            continue
        if len(rows) >= MAX_JSONL_ROWS:
            raise ValueError(f'JSONL input exceeds its row limit: {path.name}')
        try:
            line = encoded_line.decode('utf-8', errors='strict')
            value = strict_json_loads(line)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            raise ValueError(f'Invalid strict JSON in {path.name} at line {line_number}') from None
        if not isinstance(value, dict):
            raise ValueError(f'JSONL rows must be objects in {path.name} at line {line_number}')
        rows.append(value)
    return rows


def write_jsonl(file_path: str | Path, rows: list[JsonObject]) -> None:
    path = Path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(''.join(f'{stable_json_dumps(row)}\n' for row in rows), encoding='utf-8')


def read_json(file_path: str | Path) -> JsonObject:
    path = Path(file_path)
    return read_bounded_json(path, MAX_MODEL_JSON_BYTES, 'model JSON')


def read_bounded_json(file_path: str | Path, max_bytes: int, label: str) -> JsonObject:
    path = Path(file_path)
    contents = read_bounded_bytes(path, max_bytes, label)
    try:
        value = strict_json_loads(contents.decode('utf-8', errors='strict'))
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        raise ValueError(f'Invalid strict JSON input: {path.name}') from None
    if not isinstance(value, dict):
        raise ValueError(f'JSON input must contain an object: {path.name}')
    return value


def read_bounded_bytes(file_path: Path, max_bytes: int, label: str) -> bytes:
    safe_name = file_path.name
    try:
        initial_stats = file_path.lstat()
    except FileNotFoundError:
        raise FileNotFoundError(f'Missing {label} file: {safe_name}') from None
    except OSError:
        raise ValueError(f'Unable to inspect {label} file: {safe_name}') from None

    if not stat.S_ISREG(initial_stats.st_mode):
        raise ValueError(f'{label} input must be a regular non-symlink file: {safe_name}')
    if initial_stats.st_size > max_bytes:
        raise ValueError(f'{label} input exceeds its byte limit: {safe_name}')

    open_flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    try:
        descriptor = os.open(file_path, open_flags)
    except OSError:
        raise ValueError(f'Unable to open {label} input safely: {safe_name}') from None

    try:
        with os.fdopen(descriptor, 'rb') as input_file:
            opened_stats = os.fstat(input_file.fileno())
            if (
                not stat.S_ISREG(opened_stats.st_mode)
                or (initial_stats.st_dev, initial_stats.st_ino) != (opened_stats.st_dev, opened_stats.st_ino)
                or opened_stats.st_size > max_bytes
            ):
                raise ValueError(f'{label} input changed or exceeded its byte limit: {safe_name}')
            contents = input_file.read(max_bytes + 1)
            final_stats = os.fstat(input_file.fileno())
            try:
                final_path_stats = file_path.lstat()
            except OSError:
                raise ValueError(f'{label} input changed while it was being read: {safe_name}') from None
    except ValueError:
        raise
    except OSError:
        raise ValueError(f'Unable to read {label} input safely: {safe_name}') from None

    if (
        not stat.S_ISREG(final_path_stats.st_mode)
        or (opened_stats.st_dev, opened_stats.st_ino) != (final_path_stats.st_dev, final_path_stats.st_ino)
        or len(contents) > max_bytes
        or final_stats.st_size > max_bytes
        or len(contents) != final_stats.st_size
        or (opened_stats.st_size, opened_stats.st_mtime_ns, opened_stats.st_ctime_ns)
        != (final_stats.st_size, final_stats.st_mtime_ns, final_stats.st_ctime_ns)
    ):
        raise ValueError(f'{label} input changed or exceeded its byte limit: {safe_name}')
    return contents


def strict_json_loads(value: str) -> Any:
    return json.loads(
        value,
        parse_constant=_reject_json_constant,
        parse_float=_parse_finite_float,
        object_pairs_hook=_unique_object
    )


def _reject_json_constant(_value: str) -> None:
    raise ValueError('Non-standard JSON numeric constants are not allowed')


def _parse_finite_float(value: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed):
        raise ValueError('JSON numbers must be finite')
    return parsed


def _unique_object(pairs: list[tuple[str, Any]]) -> JsonObject:
    value: JsonObject = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('Duplicate JSON object keys are not allowed')
        value[key] = item
    return value


def write_json(file_path: str | Path, value: JsonObject) -> None:
    path = Path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'{json.dumps(value, indent=2, sort_keys=True)}\n', encoding='utf-8')
