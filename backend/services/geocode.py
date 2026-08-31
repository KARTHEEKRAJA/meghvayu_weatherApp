"""
Geocoding service.
Accepts city names, zip/postal codes, landmarks, and "lat,lon" GPS strings.
Primary: OpenStreetMap Nominatim (free, no API key, fuzzy matching).
Fallback: OpenWeatherMap Geocoding API (per-key limits) when Nominatim is
unavailable - e.g. per-IP throttling on shared free-tier hosting.
"""
import os
import re
import time

import requests
from errors import ApiError

NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"
OWM_GEO = "https://api.openweathermap.org/geo/1.0"
HEADERS = {"User-Agent": "MeghVayu-WeatherApp/1.0 (PM Accelerator assessment)"}
GPS_RE = re.compile(r"^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$")

# Small cache: repeated searches for the same place skip the network entirely
_CACHE_TTL = 60 * 60  # 1 hour; place coordinates don't change
_cache = {}


def _cache_get(key):
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    _cache.pop(key, None)
    return None


def _cache_set(key, place):
    if len(_cache) > 500:
        _cache.clear()
    _cache[key] = (time.time() + _CACHE_TTL, place)


def resolve_location(query):
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

    cached = _cache_get(q.lower())
    if cached:
        return cached

    # Case 2: city, zip, landmark - Nominatim first, OWM geocoding as fallback
    try:
        place = _nominatim_search(q)
    except ApiError as primary_err:
        if primary_err.status == 404 or not os.environ.get("OPENWEATHER_API_KEY"):
            raise  # a real "not found" (or no fallback configured) - surface it
        print(f"Nominatim failed ({primary_err.message}); using OpenWeatherMap geocoding fallback.")
        place = _owm_geocode(q)

    _cache_set(q.lower(), place)
    return place


def _nominatim_search(q):
    params = {"q": q, "format": "json", "limit": 1, "addressdetails": 1}
    # Bare 5-digit codes are ambiguous across countries (e.g. 76201 matches a
    # Lithuanian postal code) - bias them to the US.
    if re.fullmatch(r"\d{5}", q):
        params["countrycodes"] = "us"
    try:
        res = requests.get(NOMINATIM_SEARCH, params=params, headers=HEADERS, timeout=10)
    except requests.RequestException:
        raise ApiError(502, "Geocoding service is unavailable. Try again shortly.")
    if not res.ok:
        raise ApiError(502, f"Geocoding service returned HTTP {res.status_code}. Try again shortly.")
    results = res.json()
    if not results:
        raise ApiError(404, f'Could not find "{q}". Try a city name, zip code, landmark, or "lat,lon" coordinates.')
    top = results[0]
    return {"name": top["display_name"], "lat": float(top["lat"]), "lon": float(top["lon"])}


def _owm_geocode(q):
    """Fallback geocoder. US 5-digit zips via the zip endpoint, everything else via direct search."""
    key = os.environ["OPENWEATHER_API_KEY"]
    try:
        if re.fullmatch(r"\d{5}", q):
            res = requests.get(f"{OWM_GEO}/zip", params={"zip": f"{q},US", "appid": key}, timeout=10)
            if res.ok:
                d = res.json()
                name = ", ".join(p for p in (d.get("name"), q, d.get("country")) if p)
                return {"name": name, "lat": float(d["lat"]), "lon": float(d["lon"])}
        res = requests.get(f"{OWM_GEO}/direct", params={"q": q, "limit": 1, "appid": key}, timeout=10)
    except requests.RequestException:
        raise ApiError(502, "Geocoding services are unavailable. Try again shortly.")
    if not res.ok:
        raise ApiError(502, f"Fallback geocoder returned HTTP {res.status_code}. Try again shortly.")
    results = res.json()
    if not results:
        raise ApiError(404, f'Could not find "{q}". Try a city name, zip code, landmark, or "lat,lon" coordinates.')
    top = results[0]
    name = ", ".join(p for p in (top.get("name"), top.get("state"), top.get("country")) if p)
    return {"name": name or q, "lat": float(top["lat"]), "lon": float(top["lon"])}


def _reverse_name(lat, lon):
    """Reverse geocode coordinates to a readable place name (best effort, never fatal)."""
    try:
        res = requests.get(NOMINATIM_REVERSE, params={"lat": lat, "lon": lon, "format": "json"},
                           headers=HEADERS, timeout=10)
        if res.ok:
            name = res.json().get("display_name")
            if name:
                return name
    except requests.RequestException:
        pass
    key = os.environ.get("OPENWEATHER_API_KEY")
    if key:
        try:
            res = requests.get(f"{OWM_GEO}/reverse", params={"lat": lat, "lon": lon, "limit": 1, "appid": key},
                               timeout=10)
            if res.ok and res.json():
                top = res.json()[0]
                return ", ".join(p for p in (top.get("name"), top.get("state"), top.get("country")) if p)
        except requests.RequestException:
            pass
    return None