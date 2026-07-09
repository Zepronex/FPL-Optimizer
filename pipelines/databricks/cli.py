from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Sequence

from .io import write_local_tables
from .spark_io import is_pyspark_available, write_spark_tables
from .transforms import LayerName, build_layer_tables, read_ingestion_dataset


def run_layer(layer: LayerName, argv: Sequence[str] | None = None) -> int:
    args = parse_args(layer, argv)
    input_dir = resolve_repo_path(args.input)
    output_dir = resolve_repo_path(args.output)
    dataset = read_ingestion_dataset(input_dir)
    tables = build_layer_tables(layer, dataset)

    engine = args.engine
    if engine == 'auto':
        engine = 'spark' if is_pyspark_available() and not args.dry_run else 'local'

    if engine == 'spark':
        written_dir = write_spark_tables(
            layer,
            tables,
            output_dir,
            file_format=args.format,
            mode=args.mode
        )
        print(f'{layer} pipeline wrote {len(tables)} tables with PySpark to {written_dir}')
    else:
        written_dir = write_local_tables(
            layer,
            tables,
            output_dir,
            dry_run=args.dry_run,
            sample_limit=args.sample_limit
        )
        suffix = ' dry-run sample' if args.dry_run else ''
        print(f'{layer} pipeline wrote{suffix} {len(tables)} tables as JSONL to {written_dir}')

    return 0


def run_all(argv: Sequence[str] | None = None) -> int:
    args = parse_args('bronze', argv)
    shared_args = args_to_argv(args)
    for layer in ('bronze', 'silver', 'gold'):
        run_layer(layer, shared_args)
    return 0


def parse_args(layer: LayerName, argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=f'Run the ScoutIQ {layer} lakehouse pipeline.')
    parser.add_argument(
        '--input',
        default='data/fpl/latest',
        help='Directory containing Day 2 normalized FPL ingestion JSON files.'
    )
    parser.add_argument(
        '--output',
        default='data/lakehouse',
        help='Lakehouse output root. Layer folders are created below this path.'
    )
    parser.add_argument(
        '--engine',
        choices=('local', 'spark', 'auto'),
        default='local',
        help='Execution engine. local writes JSONL; spark writes with PySpark; auto uses Spark when available.'
    )
    parser.add_argument(
        '--format',
        choices=('parquet', 'delta', 'json'),
        default='parquet',
        help='Spark output format. Ignored by the local JSONL engine.'
    )
    parser.add_argument(
        '--mode',
        choices=('overwrite', 'append'),
        default='overwrite',
        help='Spark write mode. Ignored by the local JSONL engine.'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Validate input and write sample JSONL output under data/lakehouse/dry-run.'
    )
    parser.add_argument(
        '--sample-limit',
        type=int,
        default=5,
        help='Maximum rows per table written during --dry-run.'
    )
    return parser.parse_args(normalize_argv(argv))


def args_to_argv(args: argparse.Namespace) -> list[str]:
    values = [
        '--input',
        args.input,
        '--output',
        args.output,
        '--engine',
        args.engine,
        '--format',
        args.format,
        '--mode',
        args.mode,
        '--sample-limit',
        str(args.sample_limit)
    ]
    if args.dry_run:
        values.append('--dry-run')
    return values


def normalize_argv(argv: Sequence[str] | None) -> list[str]:
    values = list(sys.argv[1:] if argv is None else argv)
    return [value for value in values if value != '--']


def resolve_repo_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return find_repo_root(Path.cwd()) / path


def find_repo_root(start_dir: Path) -> Path:
    current = start_dir.resolve()
    while True:
        if (current / 'pnpm-workspace.yaml').exists():
            return current
        if current.parent == current:
            return start_dir.resolve()
        current = current.parent
