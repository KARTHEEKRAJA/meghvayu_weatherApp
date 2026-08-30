"use client";

import { useState } from "react";
import WeatherPanel from "@/components/WeatherPanel";
import RecordsPanel from "@/components/RecordsPanel";
import WeatherEffects from "@/components/WeatherEffects";


const AUTHOR_NAME = "Leela Satya Kartheek Raja";

export default function Home() {
  const [tab, setTab] = useState("weather");
  const [sky, setSky] = useState("none");
  const [showInfo, setShowInfo] = useState(false);

  return (
    <main data-sky={sky} className="px-4 py-6 sm:px-8">
      <WeatherEffects sky={sky} />
      <div className="app-content mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="ink text-3xl font-bold tracking-tight">
              MeghVayu
            </h1>
            <p className="ink-soft text-sm">
              by {AUTHOR_NAME} · PM Accelerator Tech Assessment
            </p>
          </div>
          <div className="flex items-center gap-2">
            <nav className="glass flex rounded-full p-1 text-sm font-medium">
              {[
                ["weather", "Weather"],
                ["records", "History (CRUD)"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`rounded-full px-4 py-1.5 transition ${
                    tab === id
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-white/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
            <button
              onClick={() => setShowInfo(true)}
              aria-label="About PM Accelerator"
              className="glass rounded-full px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-white"
            >
              ⓘ Info
            </button>
          </div>
        </header>

        {tab === "weather" ? (
          <WeatherPanel onSkyChange={setSky} />
        ) : (
          <RecordsPanel />
        )}

        <footer className="ink-soft mt-10 pb-4 text-center text-xs">
          Built with Next.js, Express, SQLite · Weather data from Open-Meteo ·
          Geocoding by OpenStreetMap Nominatim
        </footer>
      </div>

      {showInfo && (
        <div
          className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="modal-card glass max-w-lg rounded-2xl p-6 text-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-xl font-bold">About PM Accelerator</h2>
            <p className="text-sm leading-relaxed">
              The Product Manager Accelerator Program supports PM professionals
              at every stage of their career from students seeking their first
              product role to directors and executives leveling up their
              leadership. Through hands-on training, coaching, and a global
              community, PM Accelerator has helped thousands of learners land
              product management and AI roles at top companies. Learn more on
              their{" "}
              <a
                href="https://www.linkedin.com/school/pmaccelerator/"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-700 underline"
              >
                LinkedIn page
              </a>
              .
            </p>
            <p className="mt-3 text-sm">
              App developed by <span className="font-semibold">{AUTHOR_NAME}</span>{" "}
              for the AI Engineer Intern technical assessment (full-stack:
              Assessment 1 + 2).
            </p>
            <button
              onClick={() => setShowInfo(false)}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}