"""GET /api/weather - current conditions + 5-day forecast + smart insights."""
from fastapi import APIRouter, Query
from errors import ApiError
from services.geocode import resolve_location
from services.weather import get_current_and_forecast, WEATHER_CODES
from services.insights import generate_insights

router = APIRouter()


@router.get("/api/weather")
def weather(location: str | None = Query(None), lat: float | None = Query(None), lon: float | None = Query(None)):
    if lat is not None and lon is not None:
        place = resolve_location(f"{lat},{lon}")
    elif location:
        place = resolve_location(location)
    else:
        raise ApiError(400, "Provide ?location=<city|zip|landmark|lat,lon> or ?lat=..&lon=..")

    wx = get_current_and_forecast(place["lat"], place["lon"])
    c, u, d = wx["current"], wx["current_units"], wx["daily"]

    current = {
        "temperature": c["temperature_2m"], "feelsLike": c["apparent_temperature"],
        "humidity": c["relative_humidity_2m"], "precipitation": c["precipitation"],
        "windSpeed": c["wind_speed_10m"], "windDirection": c["wind_direction_10m"],
        "pressure": c["surface_pressure"], "isDay": c["is_day"] == 1,
        "weatherCode": c["weather_code"], "condition": WEATHER_CODES.get(c["weather_code"], "Unknown"),
        "units": {"temperature": u["temperature_2m"], "windSpeed": u["wind_speed_10m"], "pressure": u["surface_pressure"]},
    }

    def opt(key, i):
        arr = d.get(key)
        return arr[i] if arr and i < len(arr) else None

    forecast = [
        {"date": t, "weatherCode": d["weather_code"][i], "condition": WEATHER_CODES.get(d["weather_code"][i], "Unknown"),
         "tempMax": d["temperature_2m_max"][i], "tempMin": d["temperature_2m_min"][i],
         "precipitationChance": opt("precipitation_probability_max", i),
         "windMax": opt("wind_speed_10m_max", i), "uvIndexMax": opt("uv_index_max", i)}
        for i, t in enumerate(d["time"]) if 1 <= i <= 5  # skip today, next 5 days
    ]
    today = {"sunrise": d["sunrise"][0], "sunset": d["sunset"][0], "tempMax": d["temperature_2m_max"][0],
             "tempMin": d["temperature_2m_min"][0], "uvIndexMax": opt("uv_index_max", 0)}

    return {
        "location": {"name": place["name"], "latitude": place["lat"], "longitude": place["lon"]},
        "timezone": wx.get("timezone"), "provider": wx.get("provider"),
        "current": current, "today": today, "forecast": forecast,
        "insights": generate_insights(d),
    }
