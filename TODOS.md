# Project TODOs

## 1) Product discovery & requirements
- Confirm Timetables API authentication, rate limits, and allowed usage.
- Validate which Timetables endpoints we can use:
  - Station lookup (`/station/{pattern}`)
  - Planned timetable (`/plan/{evaNo}/{date}/{hour}`)
  - Full/recent changes (`/fchg/{evaNo}`, `/rchg/{evaNo}`)
- Define the initial data model:
  - Stations (EVA, DS100, name)
  - Route selection per station (trip labels, line, destination/direction)
  - Timetable stops (planned vs. changed events)
  - Travel time profiles (slow/fast/custom)
  - User preferences (tracked station + route + direction)
- Decide on refresh cadence for planned vs. change data and caching strategy.

## 2) Frontend foundations (Angular)
- Scaffold Angular app in `apps/web`.
- Establish routing and layout shell.
- Create a departures-board component (static for now).
- Define UX for:
  - ✅ Station selection (Timetables `/station/{pattern}`)
  - ✅ Route + direction discovery for a station
  - ✅ Route tracking selection per station
  - ✅ Travel-time profile configuration per tracked route

## 3) Backend foundations (Cloudflare Workers)
- Scaffold Worker in `workers/api`.
- Define API endpoints:
  - ✅ `GET /api/stations` (proxy `/station/{pattern}`)
  - ✅ `GET /api/departures` (plan + changes merge)
  - ✅ `GET /api/routes` (proxy `/plan/{evaNo}/{date}/{hour}` for route discovery)
  - ✅ `GET /api/tracked-stations`
  - ✅ `POST /api/tracked-stations`
  - ✅ `GET /api/tracked-routes`
  - ✅ `POST /api/tracked-routes`
  - ✅ `GET /api/travel-times`
  - ✅ `POST /api/travel-times`
- Implement request validation and error handling.

## 4) Data storage layer
- Create D1 schema for configuration data.
- Add KV for caching planned slices and real-time changes.
- Implement DAO layer in `packages/shared` or `workers/api`.

## 5) Deutsche Bahn Timetables integration
- Implement a data ingestion module in Workers for Timetables.
- Parse XML responses into normalized DTOs.
- Merge planned data (`/plan`) with changes (`/fchg`, `/rchg`).
- Handle cancellations, platform changes, and delays.

## 6) Business logic
- Calculate leave-home recommendations based on travel profiles and departure times.
- Status rules:
  - On time vs. delayed vs. cancelled
- Action rules:
  - “Walk slowly”
  - “Hurry”
  - “Wait for next one”

## 7) UI integration
- ✅ Display departures board with live departures data.
- ✅ Render departures board text with split-flap display components.
- ✅ Correct split-flap panel orientation.
- Show status and recommended action for each tracked station + route + direction.
- Add settings screens for configuration.

## 8) Observability & quality
- Add basic logging in Workers.
- Add frontend error boundaries and UX states.
- Add unit tests for business logic.

## 9) Deployment & CI
- Configure Cloudflare Pages build settings.
- Add Wrangler deployment scripts.
- Add CI checks (lint/test/build).
