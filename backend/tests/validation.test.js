/**
 * Unit tests - run with: npm test
 * Uses Node's built-in test runner (node:test) - zero extra dependencies.
 * Covers the validation and parsing logic that guards the CRUD endpoints.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDateRange, WEATHER_CODES } from "../services/weather.js";
import { resolveLocation } from "../services/geocode.js";
import { generateInsights } from "../services/insights.js";

/* ---------- validateDateRange ---------- */

test("accepts a valid past range", () => {
  assert.equal(validateDateRange("2024-06-01", "2024-06-07"), null);
});

test("accepts a single-day range", () => {
  assert.equal(validateDateRange("2024-06-01", "2024-06-01"), null);
});

test("rejects malformed date format", () => {
  assert.match(validateDateRange("06/01/2024", "2024-06-07"), /YYYY-MM-DD/);
  assert.match(validateDateRange("2024-6-1", "2024-06-07"), /YYYY-MM-DD/);
});

test("rejects impossible calendar dates (Feb 31 rollover)", () => {
  assert.match(validateDateRange("2024-02-31", "2024-03-05"), /not a real calendar date/);
});

test("rejects start after end", () => {
  assert.match(validateDateRange("2024-06-10", "2024-06-01"), /on or before/);
});

test("rejects ranges longer than 31 days", () => {
  assert.match(validateDateRange("2024-01-01", "2024-03-01"), /Maximum 31 days/);
});

test("rejects dates before the 1940 archive limit", () => {
  assert.match(validateDateRange("1939-12-01", "1939-12-05"), /1940/);
});

test("rejects ranges beyond the 16-day forecast window", () => {
  const farOut = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  assert.match(validateDateRange(farOut, farOut), /16 days/);
});

/* ---------- resolveLocation (offline-safe paths) ---------- */

test("parses valid GPS coordinate input", async () => {
  const place = await resolveLocation("40.7128, -74.0060");
  assert.equal(place.lat, 40.7128);
  assert.equal(place.lon, -74.006);
  assert.ok(place.name.length > 0);
});

test("rejects out-of-range coordinates", async () => {
  await assert.rejects(() => resolveLocation("999, 999"), /out of range/);
});

test("rejects empty location", async () => {
  await assert.rejects(() => resolveLocation("   "), /required/);
});

/* ---------- insights engine ---------- */

function fakeDaily(overrides = {}) {
  const n = 6;
  return {
    time: Array.from({ length: n }, (_, i) =>
      new Date(Date.now() + i * 86400000).toISOString().slice(0, 10)
    ),
    temperature_2m_max: Array(n).fill(24),
    temperature_2m_min: Array(n).fill(15),
    precipitation_probability_max: Array(n).fill(10),
    wind_speed_10m_max: Array(n).fill(10),
    uv_index_max: Array(n).fill(3),
    weather_code: Array(n).fill(1),
    ...overrides,
  };
}

test("flags high UV", () => {
  const out = generateInsights({}, fakeDaily({ uv_index_max: [8, 3, 3, 3, 3, 3] }));
  assert.ok(out.some((i) => i.text.includes("UV")));
});

test("flags a rainy day with umbrella advice", () => {
  const out = generateInsights(
    {},
    fakeDaily({ precipitation_probability_max: [10, 85, 10, 10, 10, 10] })
  );
  assert.ok(out.some((i) => i.text.includes("umbrella")));
});

test("flags big temperature swings", () => {
  const out = generateInsights(
    {},
    fakeDaily({ temperature_2m_max: [18, 20, 30, 22, 19, 21] })
  );
  assert.ok(out.some((i) => i.text.includes("layers")));
});

test("caps insights at 4 for scannability", () => {
  const out = generateInsights(
    {},
    fakeDaily({
      uv_index_max: [9, 9, 9, 9, 9, 9],
      temperature_2m_max: [40, 20, 40, 20, 40, 20],
      temperature_2m_min: [-5, -5, -5, -5, -5, -5],
      precipitation_probability_max: [90, 90, 90, 90, 90, 90],
      wind_speed_10m_max: [50, 50, 50, 50, 50, 50],
    })
  );
  assert.ok(out.length <= 4);
});

/* ---------- weather code table sanity ---------- */

test("weather code table covers the core WMO codes", () => {
  for (const code of [0, 3, 45, 61, 71, 95]) {
    assert.ok(WEATHER_CODES[code], `missing code ${code}`);
  }
});

/* ---------- fallback provider mapping ---------- */
import { owmToWmo } from "../services/openweather.js";

test("maps OpenWeatherMap condition ids to WMO codes", () => {
  assert.equal(owmToWmo(800), 0);   // clear
  assert.equal(owmToWmo(802), 2);   // partly cloudy
  assert.equal(owmToWmo(500), 61);  // light rain
  assert.equal(owmToWmo(600), 71);  // light snow
  assert.equal(owmToWmo(211), 95);  // thunderstorm
  assert.equal(owmToWmo(741), 45);  // fog
});