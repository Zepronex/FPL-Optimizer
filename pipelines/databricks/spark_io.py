from __future__ import annotations

import json
from pathlib import Path

from .transforms import JsonObject, LayerName, TABLE_COLUMNS_BY_LAYER


def is_pyspark_available() -> bool:
    try:
        import pyspark  # noqa: F401
    except ImportError:
        return False
    return True


def write_spark_tables(
    layer: LayerName,
    tables: dict[str, list[JsonObject]],
    output_root: str | Path,
    *,
    file_format: str = 'parquet',
    mode: str = 'overwrite'
) -> Path:
    try:
        from pyspark.sql import SparkSession
        from pyspark.sql.types import StringType, StructField, StructType
    except ImportError as error:
        raise RuntimeError('PySpark is not installed. Use --engine local or install pyspark.') from error

    spark = SparkSession.builder.appName(f'scoutiq-{layer}-pipeline').getOrCreate()
    layer_dir = Path(output_root) / layer

    for table_name, rows in tables.items():
        table_path = str(layer_dir / table_name)
        if rows:
            json_rows = [json.dumps(row, ensure_ascii=False, sort_keys=True) for row in rows]
            dataframe = spark.read.json(spark.sparkContext.parallelize(json_rows))
        else:
            schema = StructType([
                StructField(column, StringType(), True)
                for column in TABLE_COLUMNS_BY_LAYER[layer][table_name]
            ])
            dataframe = spark.createDataFrame([], schema)
        dataframe.write.mode(mode).format(file_format).save(table_path)

    return layer_dir
