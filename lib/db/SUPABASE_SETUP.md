# Fresh Supabase database

This project uses Supabase as hosted PostgreSQL through the Express server and
Drizzle ORM. The React app does not connect to Supabase directly.

## Create the tables

In the new Supabase project, open **SQL Editor**, create a query, paste the
contents of [`drizzle/0000_cold_lockheed.sql`](drizzle/0000_cold_lockheed.sql),
and run it once. This creates `users`, `leagues`, `teams`, `players`, `ai_cache`,
and `user_sessions`. Row Level Security is enabled on each table with no browser
policies; the server uses a private Postgres connection.

To verify, run this read-only query in SQL Editor. It should return six rows,
all with `rowsecurity = true`:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'leagues', 'teams', 'players', 'ai_cache', 'user_sessions'
  )
ORDER BY tablename;
```

## Connect the server

In Supabase, choose **Connect → Session pooler** and save that PostgreSQL
connection string as `DATABASE_URL` in the server's private environment. The
server also needs a private `SESSION_SECRET`. Never put either value in Git or
the React frontend. Keep `GROQ_API_KEY` private when AI requests are enabled.

The SQL creates an empty database. Register a new app account and sync ESPN
again after the API server is running. The old Replit database is not changed.

For local use, fill `DATABASE_URL` in the ignored root `.env.local` file. The
Supabase database password belongs in that URI; URL-encode special characters
in the password. Run `pnpm dev:local`, then open `http://localhost:3000`.
Register an account and use the app's Sync page to import your real ESPN data.
The optional `GROQ_API_KEY` is only needed for AI features.
If the file editor is read-only, run `pnpm setup:local` and open the localhost
link it prints. The temporary form saves the password and optional Groq key
to `.env.local` without entering either value in a chat or Git file.

For the recommended ESPN bookmark import, open the local app in the same browser
used for ESPN, sign in, and replace any old bookmarklet with the one from the
local Sync page. It opens an authenticated app tab to import the league without
storing ESPN cookies. Repeat the bookmark import to refresh league data. The
manual cookie fallback stores credentials encrypted with `SESSION_SECRET` so
the server can refresh automatically; keep that secret stable and private.

## Future schema changes

Edit the Drizzle schema in `src/schema/`, then generate a new SQL migration with
`pnpm --filter @workspace/db run generate`. Review and apply new migrations in
order. `DATABASE_URL` is not needed to generate a migration.

The waiver wire feature adds `drizzle/0001_strong_unicorn.sql`. Apply it after
the initial migration to create the `waiver_players` table. It has Row Level
Security enabled. The updated ESPN Sync bookmark fetches available players as
well as rosters; replace the old bookmark and run it again to populate this
table. Quick Sync opens the saved ESPN league, where the bookmark completes the
import without storing ESPN cookies.
