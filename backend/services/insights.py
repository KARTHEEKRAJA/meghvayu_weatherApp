"""
Smart Insights engine (rule-based).
Analyzes the daily forecast and produces short, actionable traveler advice -
the "what's not obvious" layer the assessment asks candidates to think about.
"""
from datetime import datetime


def _day_name(date_str: str) -> str:
    return datetime.strptime(date_str, "%Y-%m-%d").strftime("%A")


def generate_insights(daily: dict) -> list[dict]:
    n = len(daily["time"])
    days = []
    for i in range(n):
        days.append({
            "date": daily["time"][i],
            "max": daily["temperature_2m_max"][i],
            "min": daily["temperature_2m_min"][i],
            "rain": (daily.get("precipitation_probability_max") or [0] * n)[i] or 0,
            "wind": (daily.get("wind_speed_10m_max") or [0] * n)[i] or 0,
            "uv": (daily.get("uv_index_max") or [0] * n)[i] or 0,
        })
    if not days:
        return []

    out = []
    if days[0]["uv"] >= 6:
        out.append({"icon": "🧴", "text": f"UV index hits {days[0]['uv']} today — pack sunscreen and sunglasses."})

    maxes = [d["max"] for d in days]
    swing = max(maxes) - min(maxes)
    if swing >= 8:
        out.append({"icon": "🧥", "text": f"Temperatures swing {round(swing)}°C over the next days — pack layers."})

    rainy = next((d for d in days if d["rain"] >= 60), None)
    if rainy:
        out.append({"icon": "☔", "text": f"{_day_name(rainy['date'])} has a {rainy['rain']}% chance of rain — bring an umbrella."})

    windy = next((d for d in days if d["wind"] >= 35), None)
    if windy:
        out.append({"icon": "💨", "text": f"Winds up to {round(windy['wind'])} km/h on {_day_name(windy['date'])} — secure loose items, expect rough cycling."})

    if any(d["max"] >= 35 for d in days):
        out.append({"icon": "🥵", "text": "Extreme heat expected — plan outdoor activity for mornings and stay hydrated."})
    if any(d["min"] <= 0 for d in days):
        out.append({"icon": "🧊", "text": "Sub-freezing temperatures ahead — watch for icy roads in mornings."})

    # Best outdoor day: driest, calmest, closest to a mild 24°C
    best = min(days, key=lambda d: d["rain"] + abs(d["max"] - 24) * 2 + d["wind"] / 3)
    if best["rain"] < 40:
        out.append({"icon": "🏞️", "text": f"{_day_name(best['date'])} looks like the best day for outdoor plans ({round(best['max'])}°C, {best['rain']}% rain chance)."})

    return out[:4]  # keep it scannable
