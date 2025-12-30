# DB Home Planner

A planning dashboard that tells you when to leave home to catch selected VRR departures in Dortmund, factoring in delays and cancellations. The UI presents departures in a station/airport-style board and suggests actions like “walk slowly,” “hurry,” or “wait for the next one.”

## Project goals
- Track configured station + route + direction combinations.
- Store travel-time profiles (slow/fast/custom) from home to tracked stations.
- Fetch real-time departure data via VRR EFA endpoints.
- Compute next departures, statuses (on time/delayed/cancelled), and guidance actions.
- Host on Cloudflare’s free tiers (Pages, Workers, D1/KV/Queues as needed).

## Planned architecture (initial)
- **Frontend**: Angular (latest) deployed via Cloudflare Pages.
- **Backend**: Cloudflare Workers (TypeScript) for API aggregation + business logic.
- **Data**: Cloudflare D1 or KV for configuration + cached departures.

## Repository layout (initial)
See [STRUCTURE.md](STRUCTURE.md) for the intended folder layout and setup steps.

## Getting started (placeholder)
This repo is intentionally minimal while the architecture and Cloudflare setup are finalized.

- Install prerequisites:
  - Node.js LTS
  - npm or pnpm
  - Cloudflare Wrangler CLI
- Follow the setup steps in [STRUCTURE.md](STRUCTURE.md) when scaffolding begins.

## GTFS refresh (monthly)
Download the latest VRR GTFS zip and regenerate the Dortmund index:
```
python3 workers/api/scripts/build_vrr_dortmund_index.py \
  --gtfs-zip /path/to/gtfs_vrr_od.zip \
  --output workers/api/src/vrr-dortmund-index.ts
```

## Next steps
See [TODOS.md](TODOS.md) for the detailed backlog.
