# Deutsche Bahn API endpoints for DB Home Planner

This document summarizes the **Timetables** API we can use for DB Home Planner. The project is constrained to this API because it is the only free-use DB API available to us right now.

> **Authoritative reference:** The OpenAPI document is checked into this repo at `docs/timetables-openapi.json`.

## 1) Access prerequisites (account + credentials)

The Timetables API is hosted on the **DB API Marketplace** and requires API credentials.

**Typical access steps**:
1. Create an account at **developer.deutschebahn.com**.
2. Create an **application** in the marketplace.
3. Subscribe the app to **Timetables**.
4. Retrieve **Client ID** + **API Key**.

**Headers used by Timetables**:
```
DB-Client-ID: <client-id>
DB-Api-Key: <api-key>
```

## 2) Timetables endpoints we can use

Base URL:
```
https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1
```

### A) Station lookup
**Endpoint**:
- `GET /station/{pattern}` — station name prefix, EVA number, DS100/rl100 code, or wildcard (`*`).

**Notes for this project**:
- Use this to resolve user-entered station names to EVA numbers.
- Store `eva`, `name`, and `ds100` from the response.

### B) Planned timetable (hourly slices)
**Endpoint**:
- `GET /plan/{evaNo}/{date}/{hour}` — planned timetable for a station in an hourly time slice.

**Notes for this project**:
- Planned data is static and does not contain messages.
- Use this as the base schedule for the departures board.

### C) Real-time changes
**Endpoints**:
- `GET /fchg/{evaNo}` — full known changes for a station.
- `GET /rchg/{evaNo}` — recent changes only (last ~2 minutes).

**Notes for this project**:
- Load `fchg` initially; then poll `rchg` when updating more frequently.
- Changes include `ct`, `cp`, `cs`, `cpth` on events plus messages.

## 3) Example requests

**Planned timetable**:
```
GET https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1/plan/8011160/240930/15
Headers:
  DB-Client-ID: <client-id>
  DB-Api-Key: <api-key>
```

**Full changes**:
```
GET https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1/fchg/8011160
Headers:
  DB-Client-ID: <client-id>
  DB-Api-Key: <api-key>
```

**Station lookup**:
```
GET https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1/station/BLS
Headers:
  DB-Client-ID: <client-id>
  DB-Api-Key: <api-key>
```

## 4) Data models (DTOs) for our normalization layer

We should normalize DB responses into a canonical model so the frontend and business logic are stable even if DB field names change.

### Station DTO
```ts
export interface Station {
  evaId: string;           // DB station identifier (EVA)
  name: string;            // human-readable name
  ds100?: string;          // station code
}
```

### Departure/Arrival DTO
```ts
export interface StationDeparture {
  stationEvaId: string;
  trainNumber?: string;    // e.g., "ICE 123" or numeric trainId
  line?: string;           // if provided by DB
  direction?: string;      // final destination
  platform?: string;

  // Times
  scheduledTime: string;   // ISO string
  realtimeTime?: string;   // ISO string if delayed

  // Status flags
  isCancelled: boolean;
  delayMinutes?: number;

  // Raw DB identifiers for merging
  tripId?: string;         // if API provides a trip id
  raw?: unknown;           // raw payload for debugging
}
```

### Timetable response DTO (normalized)
```ts
export interface TimetableSnapshot {
  stationEvaId: string;
  generatedAt: string;      // ISO
  departures: StationDeparture[];
}
```

### Travel profile DTO (project-specific)
```ts
export interface TravelProfile {
  id: string;
  name: string;             // "fast", "slow", "custom"
  minutesToStation: number;
}
```

### Recommendation DTO (project-specific)
```ts
export interface DepartureRecommendation {
  departure: StationDeparture;
  profileId: string;
  action: "walk-slowly" | "hurry" | "wait-next";
  leaveHomeAt: string;      // ISO
}
```

## 5) Integration plan (steps for our project)

1. **Station lookup**
   - Use `GET /station/{pattern}` for station search.
   - Store `eva` + `name` (and `ds100` if needed) in config storage.

2. **Planned departures**
   - Call `GET /plan/{evaNo}/{date}/{hour}` for each configured station.
   - Normalize stops into `StationDeparture` records with planned times.

3. **Real-time updates**
   - Call `GET /fchg/{evaNo}` for initial change data.
   - Poll `GET /rchg/{evaNo}` to refresh changes at 30s intervals.
   - Merge `ct`, `cp`, and cancellation status into departures.

4. **Caching strategy**
   - Cache planned data with a longer TTL (hourly slice).
   - Cache changes for ~30s to match API refresh cadence.

5. **Scheduled polling**
   - Use Worker cron or client polling to update changes periodically.
   - Recompute recommendations when new change data arrives.
