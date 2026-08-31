"""
Geocoding service.
Accepts city names, zip/postal codes, landmarks, and "lat,lon" GPS strings.
Uses OpenStreetMap Nominatim (free, no API key) with fuzzy matching built in.
"""
import re
import requests
from errors import ApiError

NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"
HEADERS = {"User-Agent": "MeghVayu-WeatherApp/1.0 (PM Accelerator assessment)"}
GPS_RE = re.compile(r"^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$")


def resolve_location(query: str | None) -> dict:
    """Resolve any user-entered location string to {name, lat, lon}."""
    if not query or not query.strip():
        raise ApiError(400, "Location is required.")
    q = query.strip()

    # Case 1: raw GPS coordinates like "40.7128, -74.0060"
    m = GPS_RE.match(q)
    if m:
        lat, lon = float(m.group(1)), float(m.group(2))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ApiError(400, "Coordinates out of range. Latitude must be -90..90, longitude -180..180.")
        name = _reverse_name(lat, lon) or f"{lat:.4f}, {lon:.4f}"
        return {"name": name, "lat": lat, "lon": lon}

    # Case 2: city, zip, landmark. Bare 5-digit codes are ambiguous across
    # countries (e.g. 76201 matches a Lithuanian postal code) - bias them to the US.
    params = {"q": q, "format": "json", "limit": 1, "addressdetails": 1}
    if re.fullmatch(r"\d{5}", q):
        params["countrycodes"] = "us"
    try:
        res = requests.get(NOMINATIM_SEARCH, params=params, headers=HEADERS, timeout=10)
    except requests.RequestException:
        raise ApiError(502, "Geocoding service is unavailable. Try again shortly.")
    if not res.ok:
        raise ApiError(502, "Geocoding service is unavailable. Try again shortly.")
    results = res.json()
    if not results:
        raise ApiError(404, f'Could not find "{q}". Try a city name, zip code, landmark, or "lat,lon" coordinates.')
    top = results[0]
    return {"name": top["display_name"], "lat": float(top["lat"]), "lon": float(top["lon"])}


def _reverse_name(lat: float, lon: float) -> str | None:
    """Reverse geocode coordinates to a readable place name (best effort)."""
    try:
        res = requests.get(NOMINATIM_REVERSE, params={"lat": lat, "lon": lon, "format": "json"},
                           headers=HEADERS, timeout=10)
        if res.ok:
            return res.json().get("display_name")
    except requests.RequestException:
        pass
    return None
