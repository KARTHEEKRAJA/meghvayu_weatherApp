"use client";

import { useEffect, useState } from "react";
import { api, codeMeta, fmtDay } from "./lib";

export default function WeatherPanel({ onSkyChange }) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [extras, setExtras] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  async function load(params) {
    setLoading(true);
    setError("");
    setExtras(null);
    try {
      const wx = await api(`/api/weather?${params}`);
      setData(wx);
      onSkyChange(codeMeta(wx.current.weatherCode, wx.current.isDay).sky);
      // Extras (map + YouTube) load in the background; failure is non-fatal
      api(`/api/extras?location=${wx.location.latitude},${wx.location.longitude}`)
        .then(setExtras)
        .catch(() => {});
    } catch (e) {
      setError(e.message);
      setData(null);
      onSkyChange("none");
    } finally {
      setLoading(false);
    }
  }

  function search(e) {
    e.preventDefault();
    if (!query.trim()) {
      setError("Enter a city, zip code, landmark, or \"lat,lon\" coordinates.");
      return;
    }
    load(`location=${encodeURIComponent(query.trim())}`);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Your browser does not support geolocation.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        load(`lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === 1
            ? "Location permission denied. Search by name instead."
            : "Could not determine your location. Search by name instead."
        );
      },
      { timeout: 10000 }
    );
  }

  // Load a default city on first visit so the page is never empty
  useEffect(() => {
    load("location=New York");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = data ? codeMeta(data.current.weatherCode, data.current.isDay) : null;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <form onSubmit={search} className="glass flex flex-col gap-2 rounded-2xl p-3 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='City, zip/postal code, landmark, or "40.71,-74.00"'
          aria-label="Location"
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-xl bg-slate-900 px-5 py-2.5 font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 sm:flex-none"
          >
            {loading ? "Loading…" : "Get weather"}
          </button>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating || loading}
            className="rounded-xl border border-slate-400 bg-white px-4 py-2.5 font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {locating ? "Locating…" : "📍 My location"}
          </button>
        </div>
      </form>

      {/* Error state */}
      {error && (
        <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800">
          <span className="font-semibold">Couldn&apos;t get weather. </span>
          {error}
        </div>
      )}

      {/* Current conditions */}
      {data && (
        <>
          <section className="glass rounded-2xl p-6">
            <p className="text-sm text-slate-600">{data.location.name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-4">
                <span className="text-6xl" role="img" aria-label={data.current.condition}>
                  {meta.icon}
                </span>
                <div>
                  <div className="text-5xl font-bold text-slate-900">
                    {Math.round(data.current.temperature)}
                    {data.current.units.temperature}
                  </div>
                  <div className="text-slate-600">
                    {data.current.condition} · feels like{" "}
                    {Math.round(data.current.feelsLike)}
                    {data.current.units.temperature}
                  </div>
                </div>
              </div>
              <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <Stat label="Humidity" value={`${data.current.humidity}%`} />
                <Stat label="Wind" value={`${data.current.windSpeed} ${data.current.units.windSpeed}`} />
                <Stat label="Pressure" value={`${data.current.pressure} ${data.current.units.pressure}`} />
                <Stat label="High / Low" value={`${Math.round(data.today.tempMax)}° / ${Math.round(data.today.tempMin)}°`} />
                <Stat label="Sunrise" value={clock(data.today.sunrise)} />
                <Stat label="Sunset" value={clock(data.today.sunset)} />
              </dl>
            </div>
            {data.insights?.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {data.insights.map((ins, i) => (
                  <p key={i} className="rounded-lg bg-amber-100/80 px-3 py-1.5 text-sm text-amber-900">
                    {ins.icon} <span className="font-medium">Smart insight:</span> {ins.text}
                  </p>
                ))}
              </div>
            )}
          </section>

          {/* 5-day forecast */}
          <section>
            <h2 className="ink mb-2 font-semibold">5-day forecast</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {data.forecast.map((d) => {
                const m = codeMeta(d.weatherCode, true);
                return (
                  <div key={d.date} className="glass tilt rounded-2xl p-4 text-center">
                    <div className="text-sm font-medium text-slate-700">{fmtDay(d.date)}</div>
                    <div className="my-1 text-3xl">{m.icon}</div>
                    <div className="text-xs text-slate-500">{d.condition}</div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {Math.round(d.tempMax)}°{" "}
                      <span className="font-normal text-slate-500">{Math.round(d.tempMin)}°</span>
                    </div>
                    {d.precipitationChance != null && (
                      <div className="mt-1 text-xs text-sky-800">💧 {d.precipitationChance}%</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Extras: map + YouTube (assessment 2.2) */}
          {extras && (
            <section className="grid gap-4 md:grid-cols-2">
              <div className="glass overflow-hidden rounded-2xl">
                <iframe
                  title="Location map"
                  src={extras.map.embedUrl}
                  className="h-64 w-full border-0"
                  loading="lazy"
                />
                <a
                  href={extras.map.googleMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block px-4 py-2 text-sm font-medium text-blue-800 hover:underline"
                >
                  Open in Google Maps ↗
                </a>
              </div>
              <div className="glass rounded-2xl p-4">
                <h3 className="mb-2 font-semibold text-slate-800">Explore this place</h3>
                {extras.youtube.mode === "api" ? (
                  <ul className="space-y-2">
                    {extras.youtube.videos.map((v) => (
                      <li key={v.url}>
                        <a href={v.url} target="_blank" rel="noreferrer"
                           className="text-sm text-blue-800 hover:underline">
                          ▶ {v.title} <span className="text-slate-500">· {v.channel}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <a
                    href={extras.youtube.searchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-blue-800 hover:underline"
                  >
                    ▶ Watch travel videos about this location on YouTube ↗
                  </a>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function clock(iso) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}