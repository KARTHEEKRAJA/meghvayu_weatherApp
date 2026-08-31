"""
Weather service backed by Open-Meteo (free, no API key).
- Current conditions + 5-day forecast: forecast API
- Historical date ranges: archive API
- Near-future date ranges (<=16 days out): forecast API

Resilience: retry with backoff, 10-minute response cache, and an automatic
fallback to OpenWeatherMap when the primary provider fails (e.g. shared-IP 429).
"""
import re
import time
from datetime import date, datetime, timedelta

import requests
from errors import ApiError
from services.openweather import get_current_and_forecast_owm, is_configured as owm_configured

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
HEADERS = {"User-Agent": "MeghVayu-WeatherApp/1.0"}

# WMO weather codes -> human labels (frontend maps the same codes to icons)
WEATHER_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    56: "Light freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
}

# ---------- resilience: retry with backoff + short-lived cache ----------

CACHE_TTL = 10 * 60  # seconds
_cache: dict[str, tuple[float, dict]] = {}


def _cache_get(key: str):
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    _cache.pop(key, None)
    return None


def _cache_set(key: str, data: dict):
    if len(_cache) > 500:
        _cache.clear()
    _cache[key] = (time.time() + CACHE_TTL, data)


def _fetch_with_retry(url: str, params: dict, label: str) -> dict:
    """GET with up to 3 attempts on transient failures (429, 5xx, network)."""
    delays = [0, 0.6, 1.5]
    last: ApiError | None = None
    for delay in delays:
        if delay:
            time.sleep(delay)
        try:
            res = requests.get(url, params=params, headers=HEADERS, timeout=15)
        except requests.RequestException as e:
            last = ApiError(502, f"Could not reach {label} ({e}). Please try again.")
            continue
        if res.ok:
            return res.json()
        transient = res.status_code == 429 or res.status_code >= 500
        reason = ""
        try:
            reason = res.json().get("reason", "")
        except Exception:
            pass
        last = ApiError(502, f"{label} returned HTTP {res.status_code}{f' ({reason})' if reason else ''}."
                             + (" Please try again in a moment." if transient else ""))
        if not transient:
            break
    raise last  # type: ignore[misc]


# ---------- public API ----------

def get_current_and_forecast(lat: float, lon: float) -> dict:
    """Current weather + daily forecast (today + 5 days). Cached; falls back to OWM."""
    key = f"fc:{lat:.3f},{lon:.3f}"
    cached = _cache_get(key)
    if cached:
        return cached
    params = {
        "latitude": lat, "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,"
                   "weather_code,wind_speed_10m,wind_direction_10m,surface_pressure",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,"
                 "sunrise,sunset,uv_index_max,wind_speed_10m_max",
        "timezone": "auto", "forecast_days": 6,
    }
    try:
        data = _fetch_with_retry(FORECAST_URL, params, "Weather service")
        data["provider"] = "open-meteo"
    except ApiError as primary_err:
        if not owm_configured():
            raise
        print(f"Open-Meteo failed ({primary_err.message}); using OpenWeatherMap fallback.")
        data = get_current_and_forecast_owm(lat, lon)
    _cache_set(key, data)
    return data


def get_temperatures_for_range(lat: float, lon: float, start_date: str, end_date: str) -> list[dict]:
    """Daily temps for a validated range. Archive API for the past, forecast API for near future."""
    today = date.today().isoformat()
    base = ARCHIVE_URL if end_date < today else FORECAST_URL
    params = {
        "latitude": lat, "longitude": lon,
        "daily": "temperature_2m_max,temperature_2m_min,temperature_2m_mean",
        "timezone": "auto", "start_date": start_date, "end_date": end_date,
    }
    data = _fetch_with_retry(base, params, "Temperature archive")
    d = data.get("daily") or {}
    if not d.get("time"):
        raise ApiError(404, "No temperature data available for that range.")
    means = d.get("temperature_2m_mean") or [None] * len(d["time"])
    return [
        {"date": t, "tempMax": d["temperature_2m_max"][i], "tempMin": d["temperature_2m_min"][i],
         "tempMean": means[i]}
        for i, t in enumerate(d["time"])
    ]


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def validate_date_range(start_date, end_date) -> str | None:
    """Return an error message, or None if the range is valid."""
    if not DATE_RE.match(start_date or "") or not DATE_RE.match(end_date or ""):
        return "Dates must be in YYYY-MM-DD format."
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
    except ValueError:
        return f'"{start_date}" is not a real calendar date.'
    try:
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        return f'"{end_date}" is not a real calendar date.'
    if start > end:
        return "Start date must be on or before end date."
    if (end - start).days + 1 > 31:
        return "Date range too large. Maximum 31 days per record."
    if start_date < "1940-01-01":
        return "Historical data is only available from 1940 onwards."
    max_future = (date.today() + timedelta(days=16)).isoformat()
    if end_date > max_future:
        return f"Forecasts are only available up to 16 days ahead (through {max_future})."
    return None
