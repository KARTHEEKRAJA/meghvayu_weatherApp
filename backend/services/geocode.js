/**
 * Geocoding service.
 * Accepts: city names, zip/postal codes, landmarks, "lat,lon" GPS strings.
 * Uses OpenStreetMap Nominatim (free, no API key) with fuzzy matching built in.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "PMA-WeatherApp-Assessment/1.0 (educational project)";

const GPS_REGEX = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/**
 * Resolve any user-entered location string to { name, lat, lon }.
 * Throws { status, message } style errors for the route layer to surface.
 */
export async function resolveLocation(query) {
  if (!query || !query.trim()) {
    const err = new Error("Location is required.");
    err.status = 400;
    throw err;
  }
  const q = query.trim();

  // Case 1: raw GPS coordinates like "40.7128, -74.0060"
  const gps = q.match(GPS_REGEX);
  if (gps) {
    const lat = parseFloat(gps[1]);
    const lon = parseFloat(gps[2]);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      const err = new Error(
        "Coordinates out of range. Latitude must be -90..90, longitude -180..180."
      );
      err.status = 400;
      throw err;
    }
    const name = await reverseName(lat, lon);
    return { name: name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon };
  }

  // Case 2: anything else - city, zip, landmark. Nominatim fuzzy-matches.
  // Plain 5-digit codes are ambiguous across countries (e.g. 76201 matches a
  // Lithuanian postal code) - bias them to the US. Users can still reach other
  // countries by adding context, e.g. "76201, Germany".
  const isUsZip = /^\d{5}$/.test(q);
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1${
    isUsZip ? "&countrycodes=us" : ""
  }`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    const err = new Error("Geocoding service is unavailable. Try again shortly.");
    err.status = 502;
    throw err;
  }
  const results = await res.json();
  if (!results.length) {
    const err = new Error(
      `Could not find "${q}". Try a city name, zip code, landmark, or "lat,lon" coordinates.`
    );
    err.status = 404;
    throw err;
  }
  const top = results[0];
  return {
    name: top.display_name,
    lat: parseFloat(top.lat),
    lon: parseFloat(top.lon),
  };
}

/** Reverse geocode coordinates to a readable place name (best effort). */
async function reverseName(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}
