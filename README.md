# DB Home Planner

A planning dashboard that tells you when to leave home to catch selected Deutsche Bahn departures, factoring in delays and cancellations. The UI will present departures in a station/airport-style board and suggest actions like “walk slowly,” “hurry,” or “wait for the next one.”

## Project goals
- Track configured stations and specific trains.
- Store travel-time profiles (slow/fast/custom) from home to station.
- Fetch real-time departure data via Deutsche Bahn APIs.
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

## Next steps
See [TODOS.md](TODOS.md) for the detailed backlog.
