import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "weather.db"));

db.pragma("journal_mode = WAL");

db.exec(`
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
  )
`);

export default db;
