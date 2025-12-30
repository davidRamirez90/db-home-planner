# VRR GTFS + EFA endpoints for DB Home Planner

This document summarizes the VRR data sources used by DB Home Planner. We rely on GTFS for static route discovery and VRR EFA for realtime departures.

## 1) VRR GTFS (static schedule data)

**Dataset**:
- https://opendata.ruhr/dataset/soll-fahrplandaten-vrr

**Notes**:
- Monthly snapshots, CC-BY license, VRR-wide coverage.
- We only ingest Dortmund stations (`stop_id` prefix `de:05913:`).
- GTFS provides full station + route relationships but no realtime.

**Local build workflow**:
1. Download the latest GTFS zip from the dataset page.
2. Generate the Dortmund index:
   ```
   python3 workers/api/scripts/build_vrr_dortmund_index.py \
     --gtfs-zip /path/to/gtfs_vrr_od.zip \
     --output workers/api/src/vrr-dortmund-index.ts
   ```
3. Commit the updated index.

## 2) VRR EFA endpoints (realtime)

Base URL:
```
https://www.vrr.de/vrr-efa/
```

### A) Departure monitor
**Endpoint**:
- `GET XML_DM_REQUEST` (outputFormat=rapidJSON)

**Required parameters**:
- `name_dm` — stop ID (e.g. `de:05913:526`)
- `type_dm=any`
- `itdDate=YYYYMMDD`
- `itdTime=HHMM`
- `useRealtime=1`

**Used for**:
- Realtime departures per station.
- Line + destination labels to match tracked routes.

### B) Stop finder (optional)
**Endpoint**:
- `GET XML_STOPFINDER_REQUEST` (outputFormat=rapidJSON)

**Used for**:
- Mapping user-entered names to VRR stop IDs when the GTFS index is insufficient.

### C) Trip request (optional)
**Endpoint**:
- `GET XML_TRIP_REQUEST2` (outputFormat=rapidJSON)

**Used for**:
- Detailed journey legs if we decide to show full stop sequences.

## 3) Project normalization

We normalize VRR data into a stable shape for the frontend:

### Station DTO
```ts
export interface Station {
  evaId: string; // VRR global stop id (e.g. de:05913:526)
  name: string;
}
```

### Route candidate DTO
```ts
export interface RouteCandidate {
  line: string;        // e.g. U47
  origin: string;      // GTFS-derived terminus (start)
  destination: string; // GTFS-derived terminus (end)
}
```

## 4) Implementation summary

- **Station search**: Dortmund GTFS index.
- **Route discovery**: Dortmund GTFS index.
- **Realtime departures**: VRR EFA `XML_DM_REQUEST`.
