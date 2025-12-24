# Project Structure & Cloudflare Setup

This document describes the intended layout of the repo and how to set up the Cloudflare services used by the project.

## Intended repository layout
```
/db-home-planner
  /apps
    /web          # Angular app (Cloudflare Pages)
  /workers
    /api          # Cloudflare Worker (TypeScript) API
  /packages
    /shared       # Shared types, utilities, and models
  /docs
  STRUCTURE.md
  TODOS.md
  README.md
```

## Cloudflare setup (free tier)

### 1) Create a Cloudflare account
- Sign up at https://dash.cloudflare.com
- Verify your email.

### 2) Install Wrangler
```
npm install -g wrangler
wrangler login
```

### 3) Cloudflare Pages (frontend)
1. Create a new Pages project.
2. Connect this GitHub repo.
3. Set build settings (once Angular app exists):
   - Build command: `npm run build`
   - Build output: `dist/<app-name>`
4. Configure environment variables for API base URL.

### 4) Cloudflare Workers (backend)
1. Initialize worker in `workers/api`:
   - `wrangler init workers/api --type=typescript`
2. Create a Worker service in the Cloudflare dashboard or via Wrangler.
3. Configure environment variables:
   - `DB_API_KEY` (if needed)
   - `DB_API_BASE_URL`

### 5) Data storage
Decide based on access patterns:
- **D1** for relational config data (stations, trains, travel profiles).
- **KV** for quick lookups or cached responses.

Recommended initial setup: **D1** for configuration + **KV** for cached departure data.

#### D1 setup
```
wrangler d1 create db-home-planner
```
- Save the database ID into `wrangler.toml` once created.

#### KV setup
```
wrangler kv:namespace create DB_HOME_PLANNER_CACHE
```
- Add the KV namespace ID to `wrangler.toml`.

### 6) Environment configuration
Plan for separate dev/prod settings:
- Use `.dev.vars` for local secrets.
- Use `wrangler secret put` for production secrets.

### 7) Local development
- Start Workers locally:
  - `wrangler dev`
- Start Angular dev server once scaffolded.

## Deutsche Bahn API notes
- Identify the correct API(s) and authentication requirements.
- Build a small compatibility layer in Workers to normalize responses.

## Deployment flow (future)
1. Push to main branch.
2. Cloudflare Pages builds & deploys the Angular app.
3. Workers deploy via `wrangler deploy` or CI pipeline.
