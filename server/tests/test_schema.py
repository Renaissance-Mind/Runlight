"""Tests for lightweight schema compatibility helpers."""

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

from runlight.db.schema import ensure_schema


async def test_ensure_schema_adds_session_metadata_columns():
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)

    async with engine.begin() as conn:
        await conn.execute(text("CREATE TABLE sessions (id INTEGER PRIMARY KEY)"))
        await conn.execute(text("CREATE TABLE events (id INTEGER PRIMARY KEY)"))

        await ensure_schema(conn)

        columns = await conn.run_sync(
            lambda sync_conn: {
                table: {column["name"] for column in inspect(sync_conn).get_columns(table)}
                for table in ("sessions", "events")
            }
        )

    await engine.dispose()

    assert columns["sessions"] >= {"session_name", "session_pin"}
    assert columns["events"] >= {"session_name", "session_pin"}
