"""SQLite persistence (standard library, zero configuration)."""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "weather.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS weather_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_query TEXT NOT NULL,        -- what the user typed
    resolved_name TEXT NOT NULL,         -- what the geocoder resolved it to
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    start_date TEXT NOT NULL,            -- YYYY-MM-DD
    end_date TEXT NOT NULL,              -- YYYY-MM-DD
    temperature_data TEXT NOT NULL,      -- JSON: [{date, tempMax, tempMin, tempMean}]
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(SCHEMA)
    return conn
