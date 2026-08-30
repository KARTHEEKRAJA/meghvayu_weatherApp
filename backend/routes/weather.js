import { Router } from "express";
import { resolveLocation } from "../services/geocode.js";
import { getCurrentAndForecast, WEATHER_CODES } from "../services/weather.js";
import { generateInsights } from "../services/insights.js";

const router = Router();

/**
 * GET /api/weather?location=<anything>          - city, zip, landmark, "lat,lon"
 * GET /api/weather?lat=..&lon=..                - browser geolocation path
 * Returns current conditions + 5-day forecast.
 */
router.get("/", async (req, res, next) => {
  try {
    let place;
    const { location, lat, lon } = req.query;

    if (lat !== undefined && lon !== undefined) {
      place = await resolveLocation(`${lat},${lon}`);
    } else if (location) {
      place = await resolveLocation(location);
    } else {
      return res.status(400).json({
        error: "Provide ?location=<city|zip|landmark|lat,lon> or ?lat=..&lon=..",
      });
    }

    const wx = await getCurrentAndForecast(place.lat, place.lon);

    const current = {
      temperature: wx.current.temperature_2m,
      feelsLike: wx.current.apparent_temperature,
      humidity: wx.current.relative_humidity_2m,
      precipitation: wx.current.precipitation,
      windSpeed: wx.current.wind_speed_10m,
      windDirection: wx.current.wind_direction_10m,
      pressure: wx.current.surface_pressure,
      isDay: wx.current.is_day === 1,
      weatherCode: wx.current.weather_code,
      condition: WEATHER_CODES[wx.current.weather_code] ?? "Unknown",
      units: {
        temperature: wx.current_units.temperature_2m,
        windSpeed: wx.current_units.wind_speed_10m,
        pressure: wx.current_units.surface_pressure,
      },
    };

    // Skip index 0 (today) - deliver the next 5 days as the forecast
    const forecast = wx.daily.time.slice(1, 6).map((date, idx) => {
      const i = idx + 1;
      return {
        date,
        weatherCode: wx.daily.weather_code[i],
        condition: WEATHER_CODES[wx.daily.weather_code[i]] ?? "Unknown",
        tempMax: wx.daily.temperature_2m_max[i],
        tempMin: wx.daily.temperature_2m_min[i],
        precipitationChance: wx.daily.precipitation_probability_max?.[i] ?? null,
        windMax: wx.daily.wind_speed_10m_max?.[i] ?? null,
        uvIndexMax: wx.daily.uv_index_max?.[i] ?? null,
      };
    });

    const today = {
      sunrise: wx.daily.sunrise[0],
      sunset: wx.daily.sunset[0],
      tempMax: wx.daily.temperature_2m_max[0],
      tempMin: wx.daily.temperature_2m_min[0],
      uvIndexMax: wx.daily.uv_index_max?.[0] ?? null,
    };

    res.json({
      location: { name: place.name, latitude: place.lat, longitude: place.lon },
      timezone: wx.timezone,
      current,
      today,
      forecast,
      insights: generateInsights(current, wx.daily),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
