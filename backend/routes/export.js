import { Router } from "express";
import db from "../db.js";

const router = Router();

/**
 * GET /api/export?format=json|csv|xml|markdown
 * Exports every stored record in the requested format as a file download.
 */
router.get("/", (req, res) => {
  const format = String(req.query.format || "json").toLowerCase();
  const rows = db
    .prepare("SELECT * FROM weather_records ORDER BY created_at DESC")
    .all()
    .map((r) => ({ ...r, temperature_data: JSON.parse(r.temperature_data) }));

  switch (format) {
    case "json":
      res.setHeader("Content-Disposition", 'attachment; filename="weather-records.json"');
      return res.type("application/json").send(JSON.stringify(rows, null, 2));

    case "csv":
      res.setHeader("Content-Disposition", 'attachment; filename="weather-records.csv"');
      // UTF-8 BOM so Excel renders non-ASCII place names correctly
      return res.type("text/csv").send("\uFEFF" + toCSV(rows));

    case "xml":
      res.setHeader("Content-Disposition", 'attachment; filename="weather-records.xml"');
      return res.type("application/xml").send(toXML(rows));

    case "markdown":
    case "md":
      res.setHeader("Content-Disposition", 'attachment; filename="weather-records.md"');
      return res.type("text/markdown").send(toMarkdown(rows));

    default:
      return res.status(400).json({
        error: `Unsupported format "${format}". Use json, csv, xml, or markdown.`,
      });
  }
});

/* ---------- format builders ---------- */

function toCSV(rows) {
  const header =
    "id,location_query,resolved_name,latitude,longitude,start_date,end_date,date,temp_max,temp_min,temp_mean,notes,created_at,updated_at";
  const lines = [header];
  for (const r of rows) {
    for (const t of r.temperature_data) {
      lines.push(
        [
          r.id, csv(r.location_query), csv(r.resolved_name), r.latitude, r.longitude,
          r.start_date, r.end_date, t.date, t.tempMax, t.tempMin, t.tempMean ?? "",
          csv(r.notes), r.created_at, r.updated_at,
        ].join(",")
      );
    }
  }
  return lines.join("\n");
}

function csv(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toXML(rows) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const records = rows
    .map((r) => {
      const temps = r.temperature_data
        .map(
          (t) =>
            `      <day date="${t.date}" tempMax="${t.tempMax}" tempMin="${t.tempMin}" tempMean="${t.tempMean ?? ""}"/>`
        )
        .join("\n");
      return `  <record id="${r.id}">
    <locationQuery>${esc(r.location_query)}</locationQuery>
    <resolvedName>${esc(r.resolved_name)}</resolvedName>
    <latitude>${r.latitude}</latitude>
    <longitude>${r.longitude}</longitude>
    <startDate>${r.start_date}</startDate>
    <endDate>${r.end_date}</endDate>
    <temperatures>
${temps}
    </temperatures>
    <notes>${esc(r.notes)}</notes>
    <createdAt>${r.created_at}</createdAt>
    <updatedAt>${r.updated_at}</updatedAt>
  </record>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<weatherRecords>\n${records}\n</weatherRecords>`;
}

function toMarkdown(rows) {
  let md = `# Weather Records Export\n\nExported: ${new Date().toISOString()}\nTotal records: ${rows.length}\n`;
  for (const r of rows) {
    md += `\n## Record ${r.id}: ${r.resolved_name}\n\n`;
    md += `- **Searched as:** ${r.location_query}\n`;
    md += `- **Coordinates:** ${r.latitude}, ${r.longitude}\n`;
    md += `- **Range:** ${r.start_date} to ${r.end_date}\n`;
    if (r.notes) md += `- **Notes:** ${r.notes}\n`;
    md += `\n| Date | Max | Min | Mean |\n|------|-----|-----|------|\n`;
    for (const t of r.temperature_data) {
      md += `| ${t.date} | ${t.tempMax}°C | ${t.tempMin}°C | ${t.tempMean ?? "-"}°C |\n`;
    }
  }
  return md;
}

export default router;
