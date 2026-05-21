import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { leaguesTable } from "@workspace/db";
import { runAutoSync } from "./lib/auto-sync-runner";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startAutoSyncScheduler();
});

function startAutoSyncScheduler(): void {
  const INTERVAL_MS = 15 * 60 * 1000;

  const runJob = async () => {
    try {
      const leagues = await db
        .select()
        .from(leaguesTable)
        .then(rows => rows.filter(l => l.autoSyncEnabled && l.espnS2 && l.swid));

      if (leagues.length === 0) return;

      logger.info({ count: leagues.length }, "Auto-sync: starting scheduled sync");
      const result = await runAutoSync(leagues);
      logger.info(
        { leaguesSynced: result.leaguesSynced, playersSynced: result.playersSynced, errors: result.errors.length },
        "Auto-sync: completed",
      );
    } catch (err) {
      logger.error({ err }, "Auto-sync scheduler error");
    }
  };

  setInterval(runJob, INTERVAL_MS);
  logger.info({ intervalMinutes: 15 }, "Auto-sync scheduler started");
}
