# mtz.city

Hyperlocal info dashboard for Martinez, CA — weather, alerts, news, events, places, civic info.
Configurable via env vars to retarget any city.

## Stack

- Next.js 16 (App Router, TypeScript) — server components, no client JS by default
- Postgres on Railway — single shared cache, populated by `/api/cron`
- `postgres` (postgres.js) DB client
- GitHub Actions (`.github/workflows/refresh.yml`) drives the cron buckets

## UI layout

- **Top weather strip** — fixed at the top of every page, sits above the site
  header. Reads cached current conditions (temp, wind, humidity, AQI, pressure,
  sunrise/sunset). Component: `src/components/WeatherStrip.tsx`.
- **Site header** — logo + nav, fixed below the strip. Component:
  `src/components/Header.tsx`.
- **Pages** — `/` (landing, not in nav), `/weather`, `/news`, `/events`,
  `/places`, `/info`, `/admin` (manual cron triggers, unsecured).
- One global stylesheet at `src/app/globals.css` — reusable classes only,
  no CSS modules or Tailwind. CSS variables `--strip-h` and `--hdr-h` size
  the two fixed bars; `main` pads itself by their sum.

## Local development

```bash
cp .env.example .env.local      # fill in DATABASE_URL + API keys
npm install
npm run dev                      # http://localhost:3000
```

Visit `/admin` and click **Run all** once to warm the cache from a cold DB.

## Configuring a new location

Set these env vars on the Railway service (or `.env.local` locally) — restart picks them up:

| Var | Example | Notes |
| --- | --- | --- |
| `SITE_NAME`        | `mtz.city`             | header logo + page titles |
| `LOCATION_NAME`    | `Martinez, CA`         | shown in copy |
| `LOCATION_SHORT`   | `Martinez`             | shown in headings |
| `LAT`              | `38.01`                | drives every weather API |
| `LON`              | `-122.14`              | "" |
| `TIMEZONE`         | `America/Los_Angeles`  | IANA tz name |
| `NOAA_BUOYS`       | `UPBC1,MZXC1`          | optional, comma-separated |
| `PURPLEAIR_SENSOR` | `156379`               | optional, single sensor id |
| `NEWS_RSS_URLS`    | `https://…,https://…`  | comma-separated RSS list |
| `FOURSQUARE_CATEGORIES` | `10000,13000,…`   | comma-separated cat ids |
| `FOURSQUARE_RADIUS_M`   | `5000`            | search radius in meters |
| `TICKETMASTER_GENRES`   | `roots,indie,…`   | classification names |

NOAA gridpoint (`MTR/97,114`) is auto-resolved at runtime from `LAT`/`LON` — don't hardcode it.

## Background refresh buckets

`/api/cron?bucket=<5m|15m|1h|4h|12h|all>` runs the matching jobs:

- **5m**  — NOAA active alerts
- **15m** — WeatherAPI current, PurpleAir, NOAA buoys
- **1h**  — NOAA forecast/hourly/aviation, WeatherAPI marine/forecast, OpenWeather, WeatherStack, USGS earthquakes, eBird, NOAA WeatherStory
- **4h**  — News RSS, NOAA water RSS, stocks
- **12h** — Foursquare places, Ticketmaster events

Pages render purely from the cache — no live API calls on user-facing routes.
Ticketmaster events are stored raw (full upstream JSON), filtered/shaped at
render time. Past events are filtered both at the API call (startDateTime)
and at render (now − 6h cutoff).

Schedules live in `.github/workflows/refresh.yml`. Manual triggers via
`/admin`.

## Deploy on Railway

1. Service → **+ New** → **GitHub Repo** → pick this repo.
2. **Variables**: add a Reference for `DATABASE_URL` pointing at the Postgres plugin, then paste the API keys + LOCATION vars.
3. Build command (auto-detected): `npm run build`.  Start: `npm run start`.
4. Cron is driven by GitHub Actions (`.github/workflows/refresh.yml`) hitting
   `https://<your-domain>/api/cron?bucket=…` — no Railway cron needed. Set the
   `SITE_URL` repo secret to your deployed URL.
