"""CRUD for weather records: /api/records"""
import json
from fastapi import APIRouter, Body
from db import get_conn
from errors import ApiError
from services.geocode import resolve_location
from services.weather import get_temperatures_for_range, validate_date_range

router = APIRouter()


def hydrate(row) -> dict:
    return {
        "id": row["id"], "locationQuery": row["location_query"], "resolvedName": row["resolved_name"],
        "latitude": row["latitude"], "longitude": row["longitude"],
        "startDate": row["start_date"], "endDate": row["end_date"],
        "temperatures": json.loads(row["temperature_data"]), "notes": row["notes"],
        "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    }


def _get_or_404(conn, record_id: int):
    if record_id < 1:
        raise ApiError(400, "Record id must be a positive integer.")
    row = conn.execute("SELECT * FROM weather_records WHERE id = ?", (record_id,)).fetchone()
    if not row:
        raise ApiError(404, f"No record with id {record_id}.")
    return row


@router.post("/api/records", status_code=201)
def create_record(body: dict = Body(...)):
    """CREATE: validate dates, fuzzy-resolve location, fetch real temps, persist."""
    location, start, end = body.get("location"), body.get("startDate"), body.get("endDate")
    notes = str(body.get("notes") or "")[:500]
    err = validate_date_range(start, end)
    if err:
        raise ApiError(400, err)
    place = resolve_location(location)
    temps = get_temperatures_for_range(place["lat"], place["lon"], start, end)
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO weather_records
               (location_query, resolved_name, latitude, longitude, start_date, end_date, temperature_data, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (location.strip(), place["name"], place["lat"], place["lon"], start, end, json.dumps(temps), notes))
        row = conn.execute("SELECT * FROM weather_records WHERE id = ?", (cur.lastrowid,)).fetchone()
    return hydrate(row)


@router.get("/api/records")
def list_records():
    """READ all."""
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM weather_records ORDER BY created_at DESC, id DESC").fetchall()
    return [hydrate(r) for r in rows]


@router.get("/api/records/{record_id}")
def get_record(record_id: int):
    """READ one."""
    with get_conn() as conn:
        return hydrate(_get_or_404(conn, record_id))


@router.put("/api/records/{record_id}")
def update_record(record_id: int, body: dict = Body(...)):
    """UPDATE: editable location/dates/notes; temps re-derived when location/range changes."""
    with get_conn() as conn:
        existing = _get_or_404(conn, record_id)
    location = body.get("location", existing["location_query"])
    start = body.get("startDate", existing["start_date"])
    end = body.get("endDate", existing["end_date"])
    notes = str(body.get("notes", existing["notes"]) or "")[:500]

    err = validate_date_range(start, end)
    if err:
        raise ApiError(400, err)

    location_changed = location.strip() != existing["location_query"]
    dates_changed = start != existing["start_date"] or end != existing["end_date"]
    place = {"name": existing["resolved_name"], "lat": existing["latitude"], "lon": existing["longitude"]}
    temps = json.loads(existing["temperature_data"])
    if location_changed:
        place = resolve_location(location)
    if location_changed or dates_changed:
        temps = get_temperatures_for_range(place["lat"], place["lon"], start, end)

    with get_conn() as conn:
        conn.execute(
            """UPDATE weather_records SET location_query=?, resolved_name=?, latitude=?, longitude=?,
               start_date=?, end_date=?, temperature_data=?, notes=?, updated_at=datetime('now') WHERE id=?""",
            (location.strip(), place["name"], place["lat"], place["lon"], start, end, json.dumps(temps), notes, record_id))
        row = conn.execute("SELECT * FROM weather_records WHERE id = ?", (record_id,)).fetchone()
    return hydrate(row)


@router.delete("/api/records/{record_id}")
def delete_record(record_id: int):
    """DELETE."""
    with get_conn() as conn:
        _get_or_404(conn, record_id)
        conn.execute("DELETE FROM weather_records WHERE id = ?", (record_id,))
    return {"deleted": True, "id": record_id}
