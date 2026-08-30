"use client";

import { useEffect, useState } from "react";
import { api, API, fmtDay } from "./lib";

const EXPORT_FORMATS = ["json", "csv", "xml", "markdown"];

export default function RecordsPanel() {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // record being edited
  const [expanded, setExpanded] = useState(null);

  // Create form state
  const [form, setForm] = useState({ location: "", startDate: "", endDate: "", notes: "" });

  async function refresh() {
    try {
      setRecords(await api("/api/records"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { refresh(); }, []);

  function flash(msg) {
    setNotice(msg);
    setError("");
    setTimeout(() => setNotice(""), 3500);
  }

  async function createRecord(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const rec = await api("/api/records", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ location: "", startDate: "", endDate: "", notes: "" });
      flash(`Saved: ${rec.resolvedName.split(",")[0]} (${rec.startDate} → ${rec.endDate})`);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/records/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          location: editing.locationQuery,
          startDate: editing.startDate,
          endDate: editing.endDate,
          notes: editing.notes,
        }),
      });
      setEditing(null);
      flash("Record updated (weather re-fetched for the new location/range).");
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm(`Delete record #${id}? This cannot be undone.`)) return;
    try {
      await api(`/api/records/${id}`, { method: "DELETE" });
      flash(`Record #${id} deleted.`);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-4">
      {/* CREATE */}
      <section className="glass rounded-2xl p-5">
        <h2 className="mb-1 text-lg font-bold text-slate-900">Save a weather lookup</h2>
        <p className="mb-3 text-sm text-slate-600">
          Enter a location and date range (past dates use historical archives; up
          to 16 days ahead uses forecasts, max 31 days per record). Real
          temperatures are fetched and stored in the database.
        </p>
        <form onSubmit={createRecord} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            required
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Location (city, zip, landmark…)"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            From
            <input
              required type="date" value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            To
            <input
              required type="date" value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800"
            />
          </label>
          <button
            disabled={busy}
            className="rounded-xl bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Fetch & save"}
          </button>
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes (optional — e.g. 'trip to see family')"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 sm:col-span-2 lg:col-span-4"
          />
        </form>
      </section>

      {notice && (
        <div className="rounded-2xl border border-green-300 bg-green-50 p-3 text-sm text-green-800">✓ {notice}</div>
      )}
      {error && (
        <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">✗ {error}</div>
      )}

      {/* EXPORT */}
      <section className="glass flex flex-wrap items-center gap-2 rounded-2xl p-4">
        <span className="text-sm font-semibold text-slate-700">Export database:</span>
        {EXPORT_FORMATS.map((f) => (
          <a
            key={f}
            href={`${API}/api/export?format=${f}`}
            className="rounded-lg border border-slate-400 bg-white px-3 py-1 text-sm font-medium uppercase text-slate-700 hover:bg-slate-100"
          >
            {f}
          </a>
        ))}
      </section>

      {/* READ / UPDATE / DELETE */}
      <section className="space-y-3">
        <h2 className="ink font-semibold">
          Stored records ({records.length})
        </h2>
        {records.length === 0 && (
          <p className="glass rounded-2xl p-4 text-sm text-slate-600">
            Nothing saved yet. Create your first record above.
          </p>
        )}
        {records.map((r) =>
          editing?.id === r.id ? (
            <form key={r.id} onSubmit={saveEdit} className="glass space-y-2 rounded-2xl p-4 ring-2 ring-sky-500">
              <div className="text-sm font-semibold text-slate-700">Editing record #{r.id}</div>
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  value={editing.locationQuery}
                  onChange={(e) => setEditing({ ...editing, locationQuery: e.target.value })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-800"
                />
                <input
                  type="date" value={editing.startDate}
                  onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-800"
                />
                <input
                  type="date" value={editing.endDate}
                  onChange={(e) => setEditing({ ...editing, endDate: e.target.value })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-800"
                />
              </div>
              <input
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                placeholder="Notes"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-800"
              />
              <div className="flex gap-2">
                <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                  {busy ? "Saving…" : "Save changes"}
                </button>
                <button type="button" onClick={() => setEditing(null)}
                        className="rounded-lg border border-slate-400 bg-white px-4 py-1.5 text-sm text-slate-700">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div key={r.id} className="glass rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">
                    #{r.id} · {r.resolvedName.split(",").slice(0, 2).join(",")}
                  </div>
                  <div className="text-sm text-slate-600">
                    {r.startDate} → {r.endDate} · searched as “{r.locationQuery}”
                    {r.notes && <> · 📝 {r.notes}</>}
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  <button onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                          className="rounded-lg border border-slate-400 bg-white px-3 py-1 text-slate-700 hover:bg-slate-100">
                    {expanded === r.id ? "Hide temps" : "View temps"}
                  </button>
                  <button onClick={() => setEditing({ ...r })}
                          className="rounded-lg border border-slate-400 bg-white px-3 py-1 text-slate-700 hover:bg-slate-100">
                    Edit
                  </button>
                  <button onClick={() => remove(r.id)}
                          className="rounded-lg border border-red-300 bg-white px-3 py-1 text-red-700 hover:bg-red-50">
                    Delete
                  </button>
                </div>
              </div>
              {expanded === r.id && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1 pr-4 font-medium">Date</th>
                        <th className="py-1 pr-4 font-medium">Max</th>
                        <th className="py-1 pr-4 font-medium">Min</th>
                        <th className="py-1 font-medium">Mean</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-800">
                      {r.temperatures.map((t) => (
                        <tr key={t.date} className="border-t border-slate-200">
                          <td className="py-1 pr-4">{fmtDay(t.date)}</td>
                          <td className="py-1 pr-4">{t.tempMax}°C</td>
                          <td className="py-1 pr-4">{t.tempMin}°C</td>
                          <td className="py-1">{t.tempMean ?? "–"}°C</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        )}
      </section>
    </div>
  );
}