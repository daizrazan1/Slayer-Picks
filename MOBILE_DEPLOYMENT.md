# Deploy Slayer Picks for phone access

Slayer Picks runs as one Node web service in production. Express serves both the API and the built React app from the same HTTPS origin. Keep the Supabase database separate.

## Hosting settings

The root `render.yaml` defines one Render web service on the Free plan. Connect the GitHub repository to Render as a Blueprint after the current code has been pushed. Render will use the commands and health check below.

| Setting | Value |
| --- | --- |
| Install | `corepack enable && pnpm install --frozen-lockfile` |
| Build | `pnpm run build:deploy` |
| Start | `pnpm run start:deploy` |
| Health check | `/api/healthz` |
| Runtime | Node.js 24 |

During Blueprint setup, enter `DATABASE_URL` and `GROQ_API_KEY` in Render's secret fields. Render generates `SESSION_SECRET` and sets `NODE_ENV=production`. Never paste secrets into `render.yaml` or GitHub.

- `DATABASE_URL`: the Supabase **Session pooler** PostgreSQL URI.
- `GROQ_API_KEY`: the Groq key for AI trade analysis.

Render supplies `PORT`. Do not upload `.env.local` or put keys in the repository. Keep the service at one replica while auto-sync uses an in-process scheduler.

Once Render provides a public HTTPS domain, check `/api/healthz` and `/sync` at that domain. On an iPhone or iPad, sign in to Slayer Picks in Safari and follow **Data Sync → iPhone / iPad** to add the Safari Share action. Copy the action script from the deployed site so it contains the public HTTPS address. To refresh a league later, open Slayer Picks first and tap **Quick Sync**. This wakes the Free service before you use Share → ESPN Sync on the ESPN page.

The Safari action still needs an end-to-end test on a physical iPhone or iPad with a signed-in ESPN league page. It imports during a user-initiated Safari session; it does not provide background ESPN authorization.
