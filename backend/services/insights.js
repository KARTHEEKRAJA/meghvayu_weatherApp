/**
 * Weather Insights engine (rule-based).
 * Analyzes current conditions + the daily forecast and produces short,
 * actionable advice for a traveler - the "what's not obvious" layer the
 * assessment asks candidates to think about.
 */

export function generateInsights(current, daily) {
  const insights = [];
  const days = daily.time.map((date, i) => ({
    date,
    max: daily.temperature_2m_max[i],
    min: daily.temperature_2m_min[i],
    rain: daily.precipitation_probability_max?.[i] ?? 0,
    wind: daily.wind_speed_10m_max?.[i] ?? 0,
    uv: daily.uv_index_max?.[i] ?? 0,
    code: daily.weather_code[i],
  }));

  const dayName = (d) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

  // High UV today
  if (days[0]?.uv >= 6) {
    insights.push({
      icon: "🧴",
      text: `UV index hits ${days[0].uv} today — pack sunscreen and sunglasses.`,
    });
  }

  // Big temperature swing across the next days
  const maxes = days.map((d) => d.max);
  const swing = Math.max(...maxes) - Math.min(...maxes);
  if (swing >= 8) {
    insights.push({
      icon: "🧥",
      text: `Temperatures swing ${Math.round(swing)}°C over the next days — pack layers.`,
    });
  }

  // First likely-rain day
  const rainy = days.find((d) => d.rain >= 60);
  if (rainy) {
    insights.push({
      icon: "☔",
      text: `${dayName(rainy.date)} has a ${rainy.rain}% chance of rain — bring an umbrella.`,
    });
  }

  // Strong wind
  const windy = days.find((d) => d.wind >= 35);
  if (windy) {
    insights.push({
      icon: "💨",
      text: `Winds up to ${Math.round(windy.wind)} km/h on ${dayName(windy.date)} — secure loose items, expect rough cycling.`,
    });
  }

  // Heat / freeze warnings
  if (days.some((d) => d.max >= 35)) {
    insights.push({
      icon: "🥵",
      text: "Extreme heat expected — plan outdoor activity for mornings and stay hydrated.",
    });
  }
  if (days.some((d) => d.min <= 0)) {
    insights.push({
      icon: "🧊",
      text: "Sub-freezing temperatures ahead — watch for icy roads in mornings.",
    });
  }

  // Best outdoor day: driest, calmest, mild
  const scored = days
    .map((d) => ({ ...d, score: d.rain + Math.abs(d.max - 24) * 2 + d.wind / 3 }))
    .sort((a, b) => a.score - b.score);
  if (scored.length && scored[0].rain < 40) {
    insights.push({
      icon: "🏞️",
      text: `${dayName(scored[0].date)} looks like the best day for outdoor plans (${Math.round(scored[0].max)}°C, ${scored[0].rain}% rain chance).`,
    });
  }

  return insights.slice(0, 4); // keep it scannable
}
