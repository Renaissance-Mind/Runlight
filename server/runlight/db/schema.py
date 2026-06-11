"""Lightweight schema compatibility helpers."""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncConnection


async def ensure_schema(conn: AsyncConnection) -> None:
    existing_columns = await conn.run_sync(
        lambda sync_conn: {
            table: {column["name"] for column in inspect(sync_conn).get_columns(table)}
            for table in ("sessions", "events")
        }
    )

    dialect = conn.dialect.name
    bool_sql = (
        "BOOLEAN NOT NULL DEFAULT false"
        if dialect == "postgresql"
        else "BOOLEAN NOT NULL DEFAULT 0"
    )

    additions = {
        "sessions": {
            "session_name": "TEXT",
            "session_pin": bool_sql,
        },
        "events": {
            "session_name": "TEXT",
            "session_pin": bool_sql,
        },
    }

    for table, columns in additions.items():
        for column, definition in columns.items():
            if column not in existing_columns[table]:
                await conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
                )
