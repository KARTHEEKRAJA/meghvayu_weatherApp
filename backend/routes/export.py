"""GET /api/export?format=json|csv|xml|markdown - export every record as a file download."""
import csv
import io
import json
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from fastapi import APIRouter, Query
from fastapi.responses import Response
from db import get_conn
from errors import ApiError

router = APIRouter()


def _rows():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM weather_records ORDER BY created_at DESC, id DESC").fetchall()
    return [{**dict(r), "temperature_data": json.loads(r["temperature_data"])} for r in rows]


def _download(content: str, media_type: str, filename: str) -> Response:
    return Response(content=content, media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/api/export")
def export(format: str = Query("json")):
    fmt = format.lower()
    rows = _rows()
    if fmt == "json":
        return _download(json.dumps(rows, indent=2, ensure_ascii=False), "application/json", "weather-records.json")
    if fmt == "csv":
        return _download("\ufeff" + to_csv(rows), "text/csv; charset=utf-8", "weather-records.csv")  # BOM for Excel
    if fmt == "xml":
        return _download(to_xml(rows), "application/xml", "weather-records.xml")
    if fmt in ("markdown", "md"):
        return _download(to_markdown(rows), "text/markdown", "weather-records.md")
    raise ApiError(400, f'Unsupported format "{format}". Use json, csv, xml, or markdown.')


def to_csv(rows) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["id", "location_query", "resolved_name", "latitude", "longitude", "start_date", "end_date",
                "date", "temp_max", "temp_min", "temp_mean", "notes", "created_at", "updated_at"])
    for r in rows:
        for t in r["temperature_data"]:  # one row per day - analysis-friendly long format
            w.writerow([r["id"], r["location_query"], r["resolved_name"], r["latitude"], r["longitude"],
                        r["start_date"], r["end_date"], t["date"], t["tempMax"], t["tempMin"],
                        t.get("tempMean") if t.get("tempMean") is not None else "", r["notes"],
                        r["created_at"], r["updated_at"]])
    return buf.getvalue()


def to_xml(rows) -> str:
    parts = ['<?xml version="1.0" encoding="UTF-8"?>', "<weatherRecords>"]
    for r in rows:
        days = "\n".join(
            f'      <day date="{t["date"]}" tempMax="{t["tempMax"]}" tempMin="{t["tempMin"]}" tempMean="{t.get("tempMean") if t.get("tempMean") is not None else ""}"/>'
            for t in r["temperature_data"])
        parts.append(f"""  <record id="{r['id']}">
    <locationQuery>{escape(r['location_query'])}</locationQuery>
    <resolvedName>{escape(r['resolved_name'])}</resolvedName>
    <latitude>{r['latitude']}</latitude>
    <longitude>{r['longitude']}</longitude>
    <startDate>{r['start_date']}</startDate>
    <endDate>{r['end_date']}</endDate>
    <temperatures>
{days}
    </temperatures>
    <notes>{escape(r['notes'] or '')}</notes>
    <createdAt>{r['created_at']}</createdAt>
    <updatedAt>{r['updated_at']}</updatedAt>
  </record>""")
    parts.append("</weatherRecords>")
    return "\n".join(parts)


def to_markdown(rows) -> str:
    md = f"# Weather Records Export\n\nExported: {datetime.now(timezone.utc).isoformat()}\nTotal records: {len(rows)}\n"
    for r in rows:
        md += f"\n## Record {r['id']}: {r['resolved_name']}\n\n"
        md += f"- **Searched as:** {r['location_query']}\n- **Coordinates:** {r['latitude']}, {r['longitude']}\n"
        md += f"- **Range:** {r['start_date']} to {r['end_date']}\n"
        if r["notes"]:
            md += f"- **Notes:** {r['notes']}\n"
        md += "\n| Date | Max | Min | Mean |\n|------|-----|-----|------|\n"
        for t in r["temperature_data"]:
            mean = t.get("tempMean") if t.get("tempMean") is not None else "-"
            md += f"| {t['date']} | {t['tempMax']}°C | {t['tempMin']}°C | {mean}°C |\n"
    return md
