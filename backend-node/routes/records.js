import { Router } from "express";
import db from "../db.js";
import { resolveLocation } from "../services/geocode.js";
import { getTemperaturesForRange, validateDateRange } from "../services/weather.js";

const router = Router();

/**
 * CREATE - POST /api/records
 * Body: { location, startDate, endDate, notes? }
 * Validates the date range, fuzzy-resolves the location, fetches real
 * temperatures for the range, and persists everything.
 */
router.post("/", async (req, res, next) => {
  try {
    const { location, startDate, endDate, notes = "" } = req.body || {};

    const dateError = validateDateRange(startDate, endDate);
    if (dateError) return res.status(400).json({ error: dateError });

    const place = await resolveLocation(location); // throws 404 if not found
    const temps = await getTemperaturesForRange(place.lat, place.lon, startDate, endDate);

    const result = db
      .prepare(
        `INSERT INTO weather_records
         (location_query, resolved_name, latitude, longitude, start_date, end_date, temperature_data, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(location.trim(), place.name, place.lat, place.lon, startDate, endDate,
           JSON.stringify(temps), String(notes).slice(0, 500));

    const record = db
      .prepare("SELECT * FROM weather_records WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json(hydrate(record));
  } catch (err) {
    next(err);
  }
});

/** READ (all) - GET /api/records */
router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM weather_records ORDER BY created_at DESC")
    .all();
  res.json(rows.map(hydrate));
});

/** READ (one) - GET /api/records/:id */
router.get("/:id", (req, res) => {
  const row = getRecordOr404(req, res);
  if (row) res.json(hydrate(row));
});

/**
 * UPDATE - PUT /api/records/:id
 * Editable fields: location, startDate, endDate, notes.
 * If location or dates change, data is re-validated and temperatures re-fetched
 * so the stored weather never contradicts the stored location/range.
 * Immutable: id, created_at, temperature_data (always derived, never hand-edited).
 */
router.put("/:id", async (req, res, next) => {
  try {
    const existing = getRecordOr404(req, res);
    if (!existing) return;

    const {
      location = existing.location_query,
      startDate = existing.start_date,
      endDate = existing.end_date,
      notes = existing.notes,
    } = req.body || {};

    const dateError = validateDateRange(startDate, endDate);
    if (dateError) return res.status(400).json({ error: dateError });

    const locationChanged = location.trim() !== existing.location_query;
    const datesChanged = startDate !== existing.start_date || endDate !== existing.end_date;

    let place = {
      name: existing.resolved_name,
      lat: existing.latitude,
      lon: existing.longitude,
    };
    let temps = JSON.parse(existing.temperature_data);

    if (locationChanged) place = await resolveLocation(location);
    if (locationChanged || datesChanged) {
      temps = await getTemperaturesForRange(place.lat, place.lon, startDate, endDate);
    }

    db.prepare(
      `UPDATE weather_records SET
         location_query = ?, resolved_name = ?, latitude = ?, longitude = ?,
         start_date = ?, end_date = ?, temperature_data = ?, notes = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(location.trim(), place.name, place.lat, place.lon, startDate, endDate,
          JSON.stringify(temps), String(notes).slice(0, 500), existing.id);

    const updated = db
      .prepare("SELECT * FROM weather_records WHERE id = ?")
      .get(existing.id);
    res.json(hydrate(updated));
  } catch (err) {
    next(err);
  }
});

/** DELETE - DELETE /api/records/:id */
router.delete("/:id", (req, res) => {
  const row = getRecordOr404(req, res);
  if (!row) return;
  db.prepare("DELETE FROM weather_records WHERE id = ?").run(row.id);
  res.json({ deleted: true, id: row.id });
});

/* ---------- helpers ---------- */

function getRecordOr404(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Record id must be a positive integer." });
    return null;
  }
  const row = db.prepare("SELECT * FROM weather_records WHERE id = ?").get(id);
  if (!row) {
    res.status(404).json({ error: `No record with id ${id}.` });
    return null;
  }
  return row;
}

/** Convert a DB row to API shape (parse the JSON temperature blob). */
function hydrate(row) {
  return {
    id: row.id,
    locationQuery: row.location_query,
    resolvedName: row.resolved_name,
    latitude: row.latitude,
    longitude: row.longitude,
    startDate: row.start_date,
    endDate: row.end_date,
    temperatures: JSON.parse(row.temperature_data),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
