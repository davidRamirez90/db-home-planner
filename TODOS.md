# Project TODOs

## 1) Product discovery & requirements
- Identify the Deutsche Bahn API(s) to use (e.g., Timetable, HAFAS, or other public endpoints).
- Confirm required authentication, rate limits, and allowed usage.
- Define the initial data model:
  - Stations
  - Trains/lines
  - Travel time profiles (slow/fast/custom)
  - User preferences
- Decide on refresh cadence for departures and caching strategy.

## 2) Frontend foundations (Angular)
- Scaffold Angular app in `apps/web`.
- Establish routing and layout shell.
- Create a departures-board component (static for now).
- Define UX for:
  - Station selection
  - Train selection
  - Travel-time profile configuration

## 3) Backend foundations (Cloudflare Workers)
- Scaffold Worker in `workers/api`.
- Define API endpoints:
  - `GET /api/departures`
  - `POST /api/stations`
  - `POST /api/trains`
  - `POST /api/travel-profiles`
- Implement request validation and error handling.

## 4) Data storage layer
- Create D1 schema for configuration data.
- Add KV for caching departures.
- Implement DAO layer in `packages/shared` or `workers/api`.

## 5) Deutsche Bahn integration
- Implement a data ingestion module in Workers.
- Normalize DB API responses into a canonical format.
- Implement delay/cancellation handling logic.

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
