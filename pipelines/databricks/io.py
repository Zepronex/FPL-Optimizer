from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .transforms import JsonObject, LayerName, TABLE_COLUMNS_BY_LAYER, stable_json_dumps, utc_now


def write_local_tables(
    layer: LayerName,
    tables: dict[str, list[JsonObject]],
    output_root: str | Path,
    *,
    dry_run: bool = False,
    sample_limit: int = 5
) -> Path:
    target_root = Path(output_root) / ('dry-run' if dry_run else '')
    layer_dir = target_root / layer
    layer_dir.mkdir(parents=True, exist_ok=True)

    written_counts: dict[str, int] = {}
    source_counts: dict[str, int] = {}
    for table_name, rows in tables.items():
        output_rows = rows[:sample_limit] if dry_run else rows
        table_dir = layer_dir / table_name
        table_dir.mkdir(parents=True, exist_ok=True)
        write_jsonl(table_dir / 'part-00000.jsonl', output_rows)
        written_counts[table_name] = len(output_rows)
        source_counts[table_name] = len(rows)

    manifest = {
        'layer': layer,
        'engine': 'local-jsonl',
        'dryRun': dry_run,
        'writtenAt': utc_now(),
        'tableColumns': TABLE_COLUMNS_BY_LAYER[layer],
        'sourceRowCounts': source_counts,
        'writtenRowCounts': written_counts
    }
    (layer_dir / '_manifest.json').write_text(
        f'{json.dumps(manifest, indent=2, sort_keys=True)}\n',
        encoding='utf-8'
    )
    return layer_dir


def write_jsonl(file_path: str | Path, rows: list[dict[str, Any]]) -> None:
    serialized_rows = ''.join(f'{stable_json_dumps(row)}\n' for row in rows)
    Path(file_path).write_text(serialized_rows, encoding='utf-8')
