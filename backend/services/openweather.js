/**
 * Fallback weather provider: OpenWeatherMap.
 * Used automatically when Open-Meteo is unavailable (e.g. HTTP 429 on shared
 * hosting IPs). OWM limits are per API key, not per IP, so it stays reliable
 * on free-tier hosts. Requires OPENWEATHER_API_KEY.
 *
 * Returns data in the SAME shape as Open-Meteo's forecast response so the
 * route layer and frontend need no changes.
 */

const OWM_BASE = "https://api.openweathermap.org/data/2.5";

/** OpenWeatherMap condition id -> WMO weather code (what the UI understands). */
export function owmToWmo(id) {
  if (id >= 200 && id < 300) return 95; // thunderstorm
  if (id >= 300 && id < 400) return id >= 313 ? 55 : 51; // drizzle
  if (id === 500) return 61;
  if (id === 501) return 63;
  if (id >= 502 && id <= 504) return 65;
  if (id === 511) return 66; // freezing rain
  if (id >= 520 && id < 600) return id >= 522 ? 82 : 80; // showers
  if (id >= 600 && id < 700) return id === 600 ? 71 : id === 601 ? 73 : 75; // snow
  if (id >= 700 && id < 800) return 45; // mist / fog / haze
  if (id === 800) return 0;
  if (id === 801) return 1;
  if (id === 802) return 2;
  return 3; // 803, 804 overcast
}

/** Format a unix timestamp as local ISO-like "YYYY-MM-DDTHH:MM" using an offset in seconds. */
function localIso(unix, offsetSec) {
  return new Date((unix + offsetSec) * 1000).toISOString().slice(0, 16);
}

export function isConfigured() {
  return Boolean(process.env.OPENWEATHER_API_KEY);
}

export async function getCurrentAndForecastOWM(lat, lon) {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    const err = new Error("Fallback weather provider is not configured.");
    err.status = 502;
    throw err;
  }
  const q = `lat=${lat}&lon=${lon}&units=metric&appid=${key}`;
  const [curRes, fcRes] = await Promise.all([
    fetch(`${OWM_BASE}/weather?${q}`),
    fetch(`${OWM_BASE}/forecast?${q}`),
  ]);
  if (!curRes.ok || !fcRes.ok) {
    const err = new Error(
      `Fallback weather provider returned HTTP ${curRes.ok ? fcRes.status : curRes.status}.`
    );
    err.status = 502;
    throw err;
  }
  const cur = await curRes.json();
  const fc = await fcRes.json();
  return normalize(cur, fc);
}

/** Convert OWM current + 3-hourly forecast into Open-Meteo's daily shape. */
export function normalize(cur, fc) {
  const offset = cur.timezone ?? fc.city?.timezone ?? 0;
  const dateOf = (unix) => localIso(unix, offset).slice(0, 10);

  // Group 3-hour slots by local calendar date
  const byDay = new Map();
  for (const slot of fc.list) {
    const date = dateOf(slot.dt);
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date).push(slot);
  }
  // Ensure today is present even if the forecast list starts later in the day
  const today = dateOf(cur.dt);
  if (!byDay.has(today)) byDay.set(today, []);

  const dates = [...byDay.keys()].sort();
  const daily = {
    time: [],
    weather_code: [],
    temperature_2m_max: [],
    temperature_2m_min: [],
    precipitation_probability_max: [],
    sunrise: [],
    sunset: [],
    uv_index_max: [],
    wind_speed_10m_max: [],
  };

  for (const date of dates) {
    const slots = byDay.get(date);
    const temps = slots.length
      ? slots.flatMap((s) => [s.main.temp_max, s.main.temp_min])
      : [cur.main.temp_max, cur.main.temp_min];
    // Pick the most severe condition of the day for the icon
    const codes = slots.length ? slots.map((s) => owmToWmo(s.weather[0].id)) : [owmToWmo(cur.weather[0].id)];
    daily.time.push(date);
    daily.weather_code.push(Math.max(...codes));
    daily.temperature_2m_max.push(Math.max(...temps));
    daily.temperature_2m_min.push(Math.min(...temps));
    daily.precipitation_probability_max.push(
      Math.round(Math.max(0, ...slots.map((s) => (s.pop ?? 0) * 100)))
    );
    daily.wind_speed_10m_max.push(
      Math.round(Math.max(0, ...slots.map((s) => (s.wind?.speed ?? 0) * 3.6)) * 10) / 10
    );
    daily.uv_index_max.push(null); // not available on OWM free endpoints
    daily.sunrise.push(localIso(cur.sys.sunrise, offset));
    daily.sunset.push(localIso(cur.sys.sunset, offset));
  }

  const isDay = cur.dt >= cur.sys.sunrise && cur.dt < cur.sys.sunset ? 1 : 0;

  return {
    timezone: fc.city?.name ? `UTC${offset >= 0 ? "+" : "-"}${Math.abs(offset / 3600)}` : "UTC",
    provider: "openweathermap",
    current: {
      temperature_2m: cur.main.temp,
      apparent_temperature: cur.main.feels_like,
      relative_humidity_2m: cur.main.humidity,
      precipitation: cur.rain?.["1h"] ?? cur.snow?.["1h"] ?? 0,
      weather_code: owmToWmo(cur.weather[0].id),
      wind_speed_10m: Math.round(cur.wind.speed * 3.6 * 10) / 10,
      wind_direction_10m: cur.wind.deg ?? 0,
      surface_pressure: cur.main.pressure,
      is_day: isDay,
    },
    current_units: { temperature_2m: "°C", wind_speed_10m: "km/h", surface_pressure: "hPa" },
    daily,
  };
}