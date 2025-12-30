# Project TODOs

## 1) Product discovery & requirements
- Confirm VRR EFA usage expectations (rate limits, allowed usage).
- Validate which VRR endpoints we can use:
  - Stop finder (`XML_STOPFINDER_REQUEST`)
  - Departure monitor (`XML_DM_REQUEST`)
  - Trip request (`XML_TRIP_REQUEST2`) for route detail if needed
- Decide how monthly GTFS snapshots are ingested/refreshed.
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
  - ✅ `GET /api/stations` (VRR GTFS-based station lookup)
  - ✅ `GET /api/departures` (VRR DM realtime)
  - ✅ `GET /api/routes` (GTFS-based route discovery)
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
- ✅ Normalize tracked route line codes (strip `de:nrw.de:` prefix).

## 5) VRR GTFS + EFA integration
- ✅ Build Dortmund GTFS station + route index.
- ✅ Use VRR DM for realtime departures.
- Implement optional trip-detail lookup via `XML_TRIP_REQUEST2`.
- Handle cancellations, platform changes, and delays from VRR responses.

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
- ✅ Support umlauts (ÄÖÜ) in split-flap display.
- ✅ Add feature flag to toggle split-flap vs. monospaced board display.
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
