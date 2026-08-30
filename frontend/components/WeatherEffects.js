"use client";

import { useMemo } from "react";

/**
 * Ambient weather particles matching the live condition:
 * rain streaks, drifting snow, twinkling stars on clear nights,
 * and a soft lightning flash during storms.
 * Pure CSS animations, pointer-events disabled, honors reduced-motion.
 */
export default function WeatherEffects({ sky }) {
  const kind = sky?.startsWith("rain")
    ? "rain"
    : sky?.startsWith("snow")
    ? "snow"
    : sky?.startsWith("storm")
    ? "storm"
    : sky === "clear-night"
    ? "stars"
    : null;

  // Stable random particle set per condition change
  const particles = useMemo(() => {
    if (!kind) return [];
    const count = kind === "stars" ? 40 : kind === "snow" ? 35 : 45;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 5,
      duration:
        kind === "snow"
          ? 6 + Math.random() * 6
          : kind === "stars"
          ? 2 + Math.random() * 3
          : 0.6 + Math.random() * 0.5,
      size: kind === "snow" ? 3 + Math.random() * 4 : 1 + Math.random() * 2,
      top: Math.random() * 60, // stars only
    }));
  }, [kind]);

  if (!kind) return null;

  return (
    <div className="fx-layer" aria-hidden="true">
      {(kind === "rain" || kind === "storm") &&
        particles.map((p) => (
          <span
            key={p.id}
            className="fx-drop"
            style={{
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
      {kind === "snow" &&
        particles.map((p) => (
          <span
            key={p.id}
            className="fx-flake"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
      {kind === "stars" &&
        particles.map((p) => (
          <span
            key={p.id}
            className="fx-star"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
      {kind === "storm" && <div className="fx-lightning" />}
    </div>
  );
}
