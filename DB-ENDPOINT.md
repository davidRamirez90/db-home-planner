# Deutsche Bahn API endpoints for DB Home Planner

This document summarizes the Deutsche Bahn (DB) APIs needed for the **DB Home Planner** project: station lookup, departures/arrivals, and real‑time delays/cancellations. It also outlines the steps to get access, the likely endpoints, and example payloads/DTOs we can normalize into our backend.

> **Important:** The authoritative source is the DB API Marketplace (developer.deutschebahn.com). Exact URL paths, parameters, and headers should be verified against the marketplace docs before implementation.

## 1) Access prerequisites (account + credentials)

Most DB APIs are hosted on the **DB API Marketplace** and require an account and API credentials.

**Typical access steps** (expected for marketplace APIs):
1. Create an account at **developer.deutschebahn.com**.
2. Create an **application** in the marketplace.
3. Subscribe the app to required APIs (e.g., Timetables, RIS Stations).
4. Retrieve **Client ID** + **API Key** (or similar). These are usually sent via headers (commonly `DB-Client-ID` and `DB-Api-Key`).
5. Add a usage plan or rate limit configuration if required by the API product.

**Account needed?**
- ✅ **Yes** for DB API Marketplace APIs. The APIs are not anonymous and require credentials.

**Documentation**
- DB API Marketplace landing page: https://developer.deutschebahn.com
- API catalog: https://developer.deutschebahn.com/store/apis

## 2) APIs needed for DB Home Planner

We need three key capabilities:
1. **Station lookup** to resolve user input (name/city) to a station identifier (EVA ID).
2. **Planned timetable** to build the departure board.
3. **Real-time changes** to update delays/cancellations/platform changes.

The typical DB product set to cover this is:

### A) RIS Stations (station search + metadata)
**Purpose:** Resolve station search queries into station IDs and geolocation metadata. This provides EVA IDs required by the Timetables API.

**Documentation:**
- Marketplace product: often called **“RIS Stations”** or **“Station Data”** on developer.deutschebahn.com

**Likely endpoints** (verify in marketplace):
- `GET /stations` — search/filter by name, type, or geographic bounds.
- `GET /stations/{id}` — fetch station detail by EVA ID.

**Notes for this project:**
- Store `evaId`, station name, and coordinates for travel-time and departure requests.
- We should cache lookups to reduce rate usage.

### B) Timetables API (planned departures + real-time changes)
**Purpose:** Build a station‑style departure board and apply live changes (delays/cancellations/platform updates).

**Documentation:**
- Marketplace product: **“Timetables”** (sometimes labeled “Fahrplan”) on developer.deutschebahn.com

**Likely endpoints** (verify in marketplace):
- `GET /plan/{eva}/{date}/{hour}` — planned timetable for a station and hour (base schedule).
- `GET /fchg/{eva}` or `GET /fchg/{eva}/{date}/{hour}` — full changes (delays/cancellations/platform changes) for the station.

**Notes for this project:**
- The **plan** endpoint is the primary source for the board.
- The **changes** endpoint is applied to each item on the board to reflect delays/cancellations.
- Merge data by trip identifiers (train number + scheduled time, or unique trip ID returned by the API).

### C) Optional: Journey/Trip API (future)
**Purpose:** If we later want direct trip data, routing, or multi-stop journey details beyond a station board.

**Documentation:**
- DB API Marketplace may offer a **Journey/Trip** API. This is not required for the initial scope but can help with future features like “next train to destination” or recommended alternatives.

## 3) Authentication + request format (expected)

**Typical headers used by DB API Marketplace** (confirm in docs):
```
DB-Client-ID: <client-id>
DB-Api-Key: <api-key>
```

**Example request** (planned timetable):
```
GET https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1/plan/8011160/20250101/15
Headers:
  DB-Client-ID: <client-id>
  DB-Api-Key: <api-key>
```

**Example request** (changes):
```
GET https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1/fchg/8011160
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
  latitude?: number;
  longitude?: number;
  countryCode?: string;    // optional if provided
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
   - Use RIS Stations API to search stations by name.
   - Store `evaId` in the project config (D1/KV).

2. **Planned departures**
   - Call Timetables `plan` for each configured station and target hour.
   - Normalize into `StationDeparture` records with scheduled times.

3. **Real-time updates**
   - Call Timetables `fchg` for each station.
   - Merge changes into the planned departures (delays, cancellations, platform changes).

4. **Caching strategy**
   - Cache results in KV (short TTL, e.g., 30–60 seconds) to reduce API hits.
   - Recompute recommendations when new data arrives.

5. **Backfill and scheduled polling**
   - Use a Worker cron trigger to fetch updates periodically.
   - Use Workers + KV as a low-latency cache for the UI.

## 6) Example response mapping (pseudo)

**Planned timetable → StationDeparture**
```ts
const planned = {
  trainNumber: "ICE 123",
  time: "2025-01-01T15:42:00+01:00",
  direction: "Berlin Hbf",
  platform: "7",
};

const departure: StationDeparture = {
  stationEvaId: "8011160",
  trainNumber: planned.trainNumber,
  direction: planned.direction,
  platform: planned.platform,
  scheduledTime: planned.time,
  isCancelled: false,
};
```

**Changes → update**
```ts
const change = {
  trainNumber: "ICE 123",
  time: "2025-01-01T15:42:00+01:00",
  newTime: "2025-01-01T15:47:00+01:00",
  cancelled: false,
  platform: "6",
};

departure.realtimeTime = change.newTime;
// delay = realtime - scheduled
```

---

## 7) Open questions to confirm during implementation

- Exact base URL and paths for each API product (confirm in DB API Marketplace).
- Authentication header names and token format.
- Rate limits/quotas per API product and plan.
- Data fields needed for unique trip matching (trip IDs vs. train number + time).

Once confirmed, we should update this document with exact path and parameter details.
