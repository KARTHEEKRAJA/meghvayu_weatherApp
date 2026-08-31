"""
Fallback weather provider: OpenWeatherMap.
Used automatically when Open-Meteo is unavailable (e.g. HTTP 429 on shared
hosting IPs). OWM limits are per API key, not per IP, so it stays reliable
on free-tier hosts. Requires OPENWEATHER_API_KEY.

Returns data in the SAME shape as Open-Meteo's forecast response so the
route layer and frontend need no changes.
"""
import os
from datetime import datetime, timezone, timedelta

import requests
from errors import ApiError

OWM_BASE = "https://api.openweathermap.org/data/2.5"


def owm_to_wmo(cid: int) -> int:
    """OpenWeatherMap condition id -> WMO weather code (what the UI understands)."""
    if 200 <= cid < 300:
        return 95
    if 300 <= cid < 400:
        return 55 if cid >= 313 else 51
    if cid == 500:
        return 61
    if cid == 501:
        return 63
    if 502 <= cid <= 504:
        return 65
    if cid == 511:
        return 66
    if 520 <= cid < 600:
        return 82 if cid >= 522 else 80
    if 600 <= cid < 700:
        return {600: 71, 601: 73}.get(cid, 75)
    if 700 <= cid < 800:
        return 45
    return {800: 0, 801: 1, 802: 2}.get(cid, 3)


def is_configured() -> bool:
    return bool(os.environ.get("OPENWEATHER_API_KEY"))


def _local_iso(unix: int, offset: int) -> str:
    return datetime.fromtimestamp(unix + offset, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M")


def get_current_and_forecast_owm(lat: float, lon: float) -> dict:
    key = os.environ.get("OPENWEATHER_API_KEY")
    if not key:
        raise ApiError(502, "Fallback weather provider is not configured.")
    params = {"lat": lat, "lon": lon, "units": "metric", "appid": key}
    try:
        cur_res = requests.get(f"{OWM_BASE}/weather", params=params, timeout=10)
        fc_res = requests.get(f"{OWM_BASE}/forecast", params=params, timeout=10)
    except requests.RequestException as e:
        raise ApiError(502, f"Could not reach fallback weather provider ({e}).")
    if not cur_res.ok or not fc_res.ok:
        raise ApiError(502, f"Fallback weather provider returned HTTP {fc_res.status_code if cur_res.ok else cur_res.status_code}.")
    return normalize(cur_res.json(), fc_res.json())


def normalize(cur: dict, fc: dict) -> dict:
    """Convert OWM current + 3-hourly forecast into Open-Meteo's daily shape."""
    offset = cur.get("timezone", fc.get("city", {}).get("timezone", 0))
    date_of = lambda unix: _local_iso(unix, offset)[:10]

    by_day: dict[str, list] = {}
    for slot in fc["list"]:
        by_day.setdefault(date_of(slot["dt"]), []).append(slot)
    by_day.setdefault(date_of(cur["dt"]), [])

    daily = {k: [] for k in ["time", "weather_code", "temperature_2m_max", "temperature_2m_min",
                             "precipitation_probability_max", "sunrise", "sunset",
                             "uv_index_max", "wind_speed_10m_max"]}
    sunrise, sunset = cur["sys"]["sunrise"], cur["sys"]["sunset"]

    for date in sorted(by_day):
        slots = by_day[date]
        if slots:
            temps = [t for s in slots for t in (s["main"]["temp_max"], s["main"]["temp_min"])]
            codes = [owm_to_wmo(s["weather"][0]["id"]) for s in slots]
            pop = max((s.get("pop") or 0) * 100 for s in slots)
            wind = max((s.get("wind", {}).get("speed") or 0) * 3.6 for s in slots)
        else:
            temps = [cur["main"]["temp_max"], cur["main"]["temp_min"]]
            codes = [owm_to_wmo(cur["weather"][0]["id"])]
            pop, wind = 0, 0
        daily["time"].append(date)
        daily["weather_code"].append(max(codes))  # most severe condition of the day
        daily["temperature_2m_max"].append(max(temps))
        daily["temperature_2m_min"].append(min(temps))
        daily["precipitation_probability_max"].append(round(pop))
        daily["wind_speed_10m_max"].append(round(wind, 1))
        daily["uv_index_max"].append(None)  # not on OWM free endpoints
        daily["sunrise"].append(_local_iso(sunrise, offset))
        daily["sunset"].append(_local_iso(sunset, offset))

    is_day = 1 if sunrise <= cur["dt"] < sunset else 0
    sign = "+" if offset >= 0 else "-"
    return {
        "timezone": f"UTC{sign}{abs(offset) / 3600:g}",
        "provider": "openweathermap",
        "current": {
            "temperature_2m": cur["main"]["temp"],
            "apparent_temperature": cur["main"]["feels_like"],
            "relative_humidity_2m": cur["main"]["humidity"],
            "precipitation": cur.get("rain", {}).get("1h", cur.get("snow", {}).get("1h", 0)),
            "weather_code": owm_to_wmo(cur["weather"][0]["id"]),
            "wind_speed_10m": round(cur["wind"]["speed"] * 3.6, 1),
            "wind_direction_10m": cur["wind"].get("deg", 0),
            "surface_pressure": cur["main"]["pressure"],
            "is_day": is_day,
        },
        "current_units": {"temperature_2m": "°C", "wind_speed_10m": "km/h", "surface_pressure": "hPa"},
        "daily": daily,
    }
