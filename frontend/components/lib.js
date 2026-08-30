export const API =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Fetch wrapper: throws Error(message) using the backend's JSON error shape. */
export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error(
      "Cannot reach the backend. Is it running on " + API + "?"
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** WMO weather code -> { icon, sky } used for icons and the page theme. */
export function codeMeta(code, isDay = true) {
  const dn = isDay ? "day" : "night";
  if (code === 0 || code === 1)
    return { icon: isDay ? "☀️" : "🌙", sky: `clear-${dn}` };
  if (code === 2) return { icon: isDay ? "⛅" : "☁️", sky: `clouds-${dn}` };
  if (code === 3) return { icon: "☁️", sky: `clouds-${dn}` };
  if (code === 45 || code === 48) return { icon: "🌫️", sky: `fog-${dn}` };
  if (code >= 51 && code <= 57) return { icon: "🌦️", sky: `rain-${dn}` };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { icon: "🌧️", sky: `rain-${dn}` };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { icon: "❄️", sky: `snow-${dn}` };
  if (code >= 95) return { icon: "⛈️", sky: `storm-${dn}` };
  return { icon: "🌡️", sky: "none" };
}

export function fmtDay(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
