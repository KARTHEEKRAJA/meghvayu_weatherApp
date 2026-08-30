/**
 * Weather service backed by Open-Meteo (free, no API key).
 * - Current conditions + 5-day forecast: forecast API
 * - Historical date ranges: archive API
 * - Near-future date ranges (<=16 days out): forecast API
 */

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

/* ---------- resilience: retry with backoff + short-lived cache ---------- */

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map(); // key -> { expires, data }

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  cache.delete(key);
  return null;
}
function cacheSet(key, data) {
  if (cache.size > 500) cache.clear(); // crude bound for a demo app
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data });
}

/**
 * fetch() with up to 3 attempts on transient failures (429, 5xx, network).
 * Throws an error carrying the upstream status so the client sees a real reason.
 */
async function fetchWithRetry(url, label) {
  const delays = [0, 600, 1500];
  let lastErr;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      const res = await fetch(url, { headers: { "User-Agent": "MeghVayu-WeatherApp/1.0" } });
      if (res.ok) return res;
      const transient = res.status === 429 || res.status >= 500;
      let reason = "";
      try { reason = (await res.json()).reason || ""; } catch { /* ignore */ }
      lastErr = new Error(
        `${label} returned HTTP ${res.status}${reason ? ` (${reason})` : ""}.` +
          (transient ? " Please try again in a moment." : "")
      );
      lastErr.status = 502;
      if (!transient) break;
    } catch (e) {
      lastErr = new Error(`Could not reach ${label} (${e.message}). Please try again.`);
      lastErr.status = 502;
    }
  }
  throw lastErr;
}

/** WMO weather codes -> human labels (used by frontend for icons too). */
export const WEATHER_CODES = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  56: "Light freezing drizzle", 57: "Dense freezing drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  66: "Light freezing rain", 67: "Heavy freezing rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
  85: "Slight snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
};

/** Current weather + 5-day daily forecast for coordinates. */
export async function getCurrentAndForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max",
    timezone: "auto",
    forecast_days: "6", // today + 5 days ahead
  });
  const key = `fc:${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const res = await fetchWithRetry(`${FORECAST_URL}?${params}`, "Weather service");
  const data = await res.json();
  cacheSet(key, data);
  return data;
}

/**
 * Daily temperatures for an arbitrary validated date range.
 * Picks archive vs forecast API depending on whether the range is past or near-future.
 * Returns [{date, tempMax, tempMin, tempMean}]
 */
export async function getTemperaturesForRange(lat, lon, startDate, endDate) {
  const today = new Date().toISOString().slice(0, 10);
  const useArchive = endDate < today;

  const base = useArchive ? ARCHIVE_URL : FORECAST_URL;
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    daily: "temperature_2m_max,temperature_2m_min,temperature_2m_mean",
    timezone: "auto",
    start_date: startDate,
    end_date: endDate,
  });

  const res = await fetchWithRetry(`${base}?${params}`, "Temperature archive");
  const data = await res.json();
  const d = data.daily;
  if (!d || !d.time) {
    const err = new Error("No temperature data available for that range.");
    err.status = 404;
    throw err;
  }
  return d.time.map((date, i) => ({
    date,
    tempMax: d.temperature_2m_max[i],
    tempMin: d.temperature_2m_min[i],
    tempMean: d.temperature_2m_mean?.[i] ?? null,
  }));
}

/**
 * Validate a YYYY-MM-DD date range for the CREATE flow.
 * Rules: valid format, real dates, start <= end, range <= 31 days,
 * not before 1940 (archive limit), not more than 16 days in the future (forecast limit).
 */
export function validateDateRange(startDate, endDate) {
  const fmt = /^\d{4}-\d{2}-\d{2}$/;
  if (!fmt.test(startDate || "") || !fmt.test(endDate || "")) {
    return "Dates must be in YYYY-MM-DD format.";
  }
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  if (isNaN(start) || isNaN(end)) return "Invalid date value.";
  // Catch impossible dates like 2024-02-31 that Date() silently rolls over
  if (start.toISOString().slice(0, 10) !== startDate) return `"${startDate}" is not a real calendar date.`;
  if (end.toISOString().slice(0, 10) !== endDate) return `"${endDate}" is not a real calendar date.`;
  if (start > end) return "Start date must be on or before end date.";
  const days = (end - start) / 86400000 + 1;
  if (days > 31) return "Date range too large. Maximum 31 days per record.";
  if (startDate < "1940-01-01") return "Historical data is only available from 1940 onwards.";
  const maxFuture = new Date(Date.now() + 16 * 86400000).toISOString().slice(0, 10);
  if (endDate > maxFuture) {
    return `Forecasts are only available up to 16 days ahead (through ${maxFuture}).`;
  }
  return null; // valid
}