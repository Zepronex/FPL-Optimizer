from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pipelines.databricks.transforms import stable_json_dumps

JsonObject = dict[str, Any]


def read_jsonl(file_path: str | Path) -> list[JsonObject]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f'Missing JSONL file: {path}')

    rows: list[JsonObject] = []
    for line_number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), start=1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f'{path}:{line_number} must contain a JSON object')
        rows.append(value)
    return rows


def write_jsonl(file_path: str | Path, rows: list[JsonObject]) -> None:
    path = Path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(''.join(f'{stable_json_dumps(row)}\n' for row in rows), encoding='utf-8')


def read_json(file_path: str | Path) -> JsonObject:
    path = Path(file_path)
    value = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(value, dict):
        raise ValueError(f'{path} must contain a JSON object')
    return value


def write_json(file_path: str | Path, value: JsonObject) -> None:
    path = Path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'{json.dumps(value, indent=2, sort_keys=True)}\n', encoding='utf-8')
