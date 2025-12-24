# Project TODOs

## 1) Product discovery & requirements
- Confirm Timetables API authentication, rate limits, and allowed usage.
- Validate which Timetables endpoints we can use:
  - Station lookup (`/station/{pattern}`)
  - Planned timetable (`/plan/{evaNo}/{date}/{hour}`)
  - Full/recent changes (`/fchg/{evaNo}`, `/rchg/{evaNo}`)
- Define the initial data model:
  - Stations (EVA, DS100, name)
  - Timetable stops (planned vs. changed events)
  - Travel time profiles (slow/fast/custom)
  - User preferences
- Decide on refresh cadence for planned vs. change data and caching strategy.

## 2) Frontend foundations (Angular)
- Scaffold Angular app in `apps/web`.
- Establish routing and layout shell.
- Create a departures-board component (static for now).
- Define UX for:
  - Station selection (Timetables `/station/{pattern}`)
  - Train selection
  - Travel-time profile configuration

## 3) Backend foundations (Cloudflare Workers)
- Scaffold Worker in `workers/api`.
- Define API endpoints:
  - `GET /api/stations` (proxy `/station/{pattern}`)
  - `GET /api/departures` (plan + changes merge)
  - `POST /api/travel-profiles`
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
- Display departures board with real-time updates.
- Show status and recommended action for each configured station/train.
- Add settings screens for configuration.

## 8) Observability & quality
- Add basic logging in Workers.
- Add frontend error boundaries and UX states.
- Add unit tests for business logic.

## 9) Deployment & CI
- Configure Cloudflare Pages build settings.
- Add Wrangler deployment scripts.
- Add CI checks (lint/test/build).
