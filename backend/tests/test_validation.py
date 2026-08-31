"""Unit tests - run with: pytest. Covers validation, parsing, insights, and fallback mapping."""
from datetime import date, timedelta

import pytest
from errors import ApiError
from services.weather import validate_date_range, WEATHER_CODES
from services.geocode import resolve_location
from services.insights import generate_insights
from services.openweather import owm_to_wmo


# ---------- validate_date_range ----------

def test_accepts_valid_past_range():
    assert validate_date_range("2024-06-01", "2024-06-07") is None

def test_accepts_single_day_range():
    assert validate_date_range("2024-06-01", "2024-06-01") is None

def test_rejects_malformed_format():
    assert "YYYY-MM-DD" in validate_date_range("06/01/2024", "2024-06-07")
    assert "YYYY-MM-DD" in validate_date_range("2024-6-1", "2024-06-07")

def test_rejects_impossible_calendar_dates():
    assert "not a real calendar date" in validate_date_range("2024-02-31", "2024-03-05")

def test_rejects_start_after_end():
    assert "on or before" in validate_date_range("2024-06-10", "2024-06-01")

def test_rejects_ranges_over_31_days():
    assert "Maximum 31 days" in validate_date_range("2024-01-01", "2024-03-01")

def test_rejects_dates_before_1940():
    assert "1940" in validate_date_range("1939-12-01", "1939-12-05")

def test_rejects_beyond_16_day_forecast_window():
    far = (date.today() + timedelta(days=60)).isoformat()
    assert "16 days" in validate_date_range(far, far)


# ---------- resolve_location (offline-safe paths) ----------

def test_parses_valid_gps_input():
    place = resolve_location("40.7128, -74.0060")
    assert place["lat"] == 40.7128 and place["lon"] == -74.006 and place["name"]

def test_rejects_out_of_range_coordinates():
    with pytest.raises(ApiError, match="out of range"):
        resolve_location("999, 999")

def test_rejects_empty_location():
    with pytest.raises(ApiError, match="required"):
        resolve_location("   ")


# ---------- insights engine ----------

def fake_daily(**overrides):
    n = 6
    base = {
        "time": [(date.today() + timedelta(days=i)).isoformat() for i in range(n)],
        "temperature_2m_max": [24] * n, "temperature_2m_min": [15] * n,
        "precipitation_probability_max": [10] * n, "wind_speed_10m_max": [10] * n,
        "uv_index_max": [3] * n, "weather_code": [1] * n,
    }
    base.update(overrides)
    return base

def test_flags_high_uv():
    out = generate_insights(fake_daily(uv_index_max=[8, 3, 3, 3, 3, 3]))
    assert any("UV" in i["text"] for i in out)

def test_flags_rainy_day_with_umbrella():
    out = generate_insights(fake_daily(precipitation_probability_max=[10, 85, 10, 10, 10, 10]))
    assert any("umbrella" in i["text"] for i in out)

def test_flags_big_temperature_swing():
    out = generate_insights(fake_daily(temperature_2m_max=[18, 20, 30, 22, 19, 21]))
    assert any("layers" in i["text"] for i in out)

def test_caps_insights_at_four():
    out = generate_insights(fake_daily(uv_index_max=[9] * 6, temperature_2m_max=[40, 20] * 3,
                                       temperature_2m_min=[-5] * 6, precipitation_probability_max=[90] * 6,
                                       wind_speed_10m_max=[50] * 6))
    assert len(out) <= 4


# ---------- tables ----------

def test_weather_code_table_covers_core_codes():
    for code in (0, 3, 45, 61, 71, 95):
        assert code in WEATHER_CODES

def test_maps_openweathermap_ids_to_wmo():
    assert owm_to_wmo(800) == 0 and owm_to_wmo(802) == 2 and owm_to_wmo(500) == 61
    assert owm_to_wmo(600) == 71 and owm_to_wmo(211) == 95 and owm_to_wmo(741) == 45
