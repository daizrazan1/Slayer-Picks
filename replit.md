# Fantasy Helper

An AI-powered fantasy sports web app that syncs ESPN league data and evaluates trades using Groq AI.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/fantasy-helper run dev` — run the frontend (port 25705)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `GROQ_API_KEY` — Groq API key (stored in Replit Secrets)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + wouter (routing)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: Groq SDK (llama-3.1-8b-instant) — direct fetch calls
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI source of truth
- `lib/db/src/schema/` — DB tables: leagues, teams, players, ai_cache
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/groq.ts` — Groq AI trade evaluation + prompt caching
- `artifacts/fantasy-helper/src/` — React frontend
- `artifacts/fantasy-helper/src/pages/` — Dashboard, Sync, Leagues, League Detail, Trade Lab

## Architecture decisions

- ESPN sync uses raw ESPN Fantasy API v3 (cookie-based auth via espn_s2 + SWID)
- AI responses are cached by SHA-256 prompt hash in `ai_cache` table to stay within Groq's 30 RPM limit
- Bookmarklet uses `window.location.origin` so it auto-adapts to any deployment URL
- All ESPN data is stored in PostgreSQL — no live ESPN calls on the frontend
- Groq is called directly via fetch (no SDK dependency) to keep the bundle lean

## Product

- **Dashboard**: Overview of synced leagues, teams, players, and recent trade evaluations
- **Sync Assistant**: ESPN credential entry form + copy-to-clipboard bookmarklet for iOS Safari sync
- **Leagues**: Browse synced leagues and drill into team rosters with player stats
- **AI Trade Lab**: Select two teams, pick players being exchanged, get an AI win-score + analysis

## User preferences

- Uses Groq API key stored in Replit Secrets as `GROQ_API_KEY`

## Gotchas

- ESPN API requires valid `espn_s2` + `SWID` cookies from a logged-in ESPN session
- If ESPN returns 401/403, the tokens are expired — user must re-log in to ESPN
- Groq rate limit is 30 RPM; the `ai_cache` table prevents duplicate API calls for identical trade scenarios
- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
