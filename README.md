# MeghVayu : Full-Stack Weather App

**PM Accelerator : AI Engineer Intern Technical Assessment (Full Stack: Assessment #1 + #2)**

Built by: **Leela Satya Kartheek Raja**

A full-stack weather application: real-time conditions and a 5-day forecast on the frontend, plus a REST API with database persistence (CRUD), validation, multi-format export, and additional API integrations on the backend.

## 🔗 Live demo

- **App:** _add your Vercel URL here after deploying_
- **API health check:** _add your Render URL here_/api/health
- **Demo video:** _add your video link here_

## Highlights

- Both assessments (frontend + backend) in one integrated app
- **16 unit tests** on validation & insight logic : `cd backend && npm test` (Node's built-in runner, zero test dependencies)
- **Smart insights**: rule-based analysis of the forecast produces traveler advice (pack layers, umbrella day, best outdoor day)
- Condition-driven UI: background theme + ambient particles (rain/snow/stars/lightning) follow live weather; honors `prefers-reduced-motion`
- Zero API keys required to run

---

## Smart Insights engine

The backend includes a rule-based insights engine (`backend/services/insights.js`) that analyzes
live forecast data and generates actionable traveler advice the "what's not obvious" thinking
the assessment asks for:

- **High UV** → sunscreen reminder
- **Temperature swings ≥8°C across the week** → pack layers
- **First day with ≥60% rain probability** → umbrella advice, day named
- **Winds ≥35 km/h** → wind warning
- **Extreme heat (≥35°C) / sub-freezing days** → safety notes
- **Best outdoor day** → scores each day on rain, wind, and distance from ideal temperature

Insights are computed server-side per request, capped at 4 for scannability, and unit-tested.

**Design note:** this is deliberately deterministic rules rather than an LLM call : zero latency,
zero cost, fully testable. The architecture supports swapping in an LLM for natural-language
weather summaries as a next step.

## Screenshots

##### Live weather with condition-driven theme and smart insights
![Live weather with smart insights](screenshots/weather.png)


##### Weather history : CRUD with database persistence and exports
![CRUD history and exports](screenshots/crud.png)

##### 16 passing unit tests
![16 passing unit tests](screenshots/tests.png)

----

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | **Next.js 14 (React)** + Tailwind CSS | JS framework per assessment rules; responsive, web-first |
| Backend | **Node.js + Express** | RESTful API, one language across the stack |
| Database | **SQLite** (better-sqlite3) | Zero-config persistence, reviewers can run it with no DB setup |
| Weather data | **Open-Meteo** (forecast + historical archive APIs) | Free, no API key, supports past date ranges |
| Geocoding | **OpenStreetMap Nominatim** | Free fuzzy matching for cities, zips, landmarks, coordinates |
| Extra APIs | OpenStreetMap embed, Google Maps link, YouTube Data API (optional key) | Assessment section 2.2 |

No API keys are required to run the app. (YouTube video listing activates if you add a free `YOUTUBE_API_KEY`; otherwise it gracefully falls back to a search link.)

## How to run

Prerequisites: Node.js 18+ and npm.

**1. Backend** (port 4000):
```bash
cd backend
npm install
npm start
```

**2. Frontend** (port 3000), in a second terminal:
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

Optional: copy `frontend/.env.local.example` to `.env.local` to change the backend URL, and set `YOUTUBE_API_KEY` in the backend environment to enable YouTube results.

---

## Assessment 1 [Frontend features]

- **Flexible location input**: one search box accepts city, town, zip/postal code, landmarks ("Eiffel Tower"), or raw GPS coordinates ("40.71,-74.00"). Input is geocoded with fuzzy matching the resolved place name is always shown so the user can confirm.
- **Current location**: "📍 My location" uses the browser Geolocation API (with permission-denied and timeout handling).
- **Current weather display**: temperature, feels-like, condition + icon, humidity, wind, pressure, high/low, sunrise/sunset.
- **5-day forecast** (§1.1): responsive card grid with icons, conditions, highs/lows, and precipitation chance.
- **Error handling** (§1.2): location not found, backend unreachable, geolocation denied, empty input — each shows a clear, actionable message.
- **Responsive design**: Tailwind mobile-first breakpoints (`sm/md/lg`), fluid grids (2→3→5 forecast columns), flexible search bar layout. Works on phone, tablet, and desktop.
- **Traveler-minded extras**: UV-index sunscreen tip, sunrise/sunset for planning, and a signature touch, the page background theme shifts with live conditions (clear/cloudy/rain/snow/storm, day vs night).

## Assessment 2 [Backend features]

REST API (all JSON, central error handler):

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/weather?location=…` or `?lat=…&lon=…` | Current weather + 5-day forecast |
| POST | `/api/records` | **CREATE** : location + date range → fetches real temps → stores |
| GET | `/api/records` | **READ** all stored records |
| GET | `/api/records/:id` | **READ** one record |
| PUT | `/api/records/:id` | **UPDATE** : re-validates; re-fetches temps if location/range changed |
| DELETE | `/api/records/:id` | **DELETE** a record |
| GET | `/api/export?format=json\|csv\|xml\|markdown` | **Export** (§2.3) all records as file download |
| GET | `/api/extras?location=…` | **§2.2** : map embed + Google Maps link + YouTube videos |

**Validation** (§2.1):
- Date ranges: format, real calendar dates (rejects 2024-02-31), start ≤ end, ≤31 days, within Open-Meteo's data window (1940 → +16 days).
- Locations: must resolve via geocoder (fuzzy match allowed); clear 404 with suggestions if not found.
- Updates: same validation; `temperature_data` is always re-derived from the APIs when location/dates change, so stored weather can never contradict the stored location, users edit location/dates/notes, not raw temperatures.

**Design decisions**:
- Historical ranges use Open-Meteo's archive API; near-future ranges use the forecast API are chosen automatically.
- SQLite chosen deliberately: reviewers clone and run with zero database setup. Swappable for Postgres via the single `db.js` module.

## Project structure

```
backend/
  server.js            Express app + central error handling
  db.js                SQLite schema + connection
  services/geocode.js  Nominatim geocoding (fuzzy, zips, landmarks, GPS)
  services/weather.js  Open-Meteo calls + date-range validation
  routes/              weather, records (CRUD), export, extras
frontend/
  app/                 Next.js app router pages + condition-driven theming
  components/          WeatherPanel, RecordsPanel (CRUD UI), shared lib
```

## Debugging notes (real issues found & fixed)

1. **Ambiguous zip codes resolved internationally.** Testing with `76201` (Denton, TX) returned Šiauliai, Lithuania :  Nominatim matched the digits to a foreign postal code. Fix: bare 5-digit codes are now biased to `countrycodes=us`, while longer codes (e.g., Indian 6-digit PINs) and "zip, country" queries still resolve worldwide. Verified with mixed US/India test data.
2. **CSV exports showed garbled characters in Excel.** Non-ASCII place names (Cyrillic, Lithuanian) rendered as mojibake because Excel doesn't assume UTF-8. Fix: prepend a UTF-8 BOM to CSV output.
3. **Node 24 native-module build failure.** `better-sqlite3@11` had no prebuilt binary for Node 24 and attempted a source compile requiring Visual Studio C++ tools. Fix: upgraded to `better-sqlite3@^12`, which ships Node 24 prebuilds.

## Testing

```bash
cd backend
npm test
```
16 tests cover date-range validation (format, impossible dates like Feb 31, range limits, archive/forecast windows), GPS coordinate parsing, and the insights engine is using Node's built-in `node:test` runner, so no extra dev dependencies.



## About PM Accelerator

The Product Manager Accelerator Program supports PM professionals through every stage of their career, from students seeking their first PM role to directors and leaders growing their leadership skills via hands-on training, coaching, and a global community. See their [LinkedIn page](https://www.linkedin.com/company/product-manager-accelerator/).
