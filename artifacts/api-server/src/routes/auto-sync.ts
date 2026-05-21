import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leaguesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { runAutoSync, type SyncSummary } from "../lib/auto-sync-runner";

const router: IRouter = Router();

router.get("/sync/status", async (_req, res): Promise<void> => {
  const leagues = await db.select().from(leaguesTable);

  const hasCredentials = leagues.some(l => l.autoSyncEnabled && l.espnS2 && l.swid);

  res.json({
    hasCredentials,
    leagues: leagues.map(l => ({
      id: l.id,
      name: l.name,
      sport: l.sport,
      autoSyncEnabled: l.autoSyncEnabled,
      lastAutoSyncAt: l.lastAutoSyncAt?.toISOString() ?? null,
      lastAutoSyncError: l.lastAutoSyncError ?? null,
    })),
  });
});

router.post("/sync/refresh", async (req, res): Promise<void> => {
  const leagues = await db
    .select()
    .from(leaguesTable)
    .then(rows => rows.filter(l => l.autoSyncEnabled && l.espnS2 && l.swid));

  if (leagues.length === 0) {
    res.status(400).json({ error: "No leagues have stored credentials. Please sync manually first using your ESPN cookies." });
    return;
  }

  req.log.info({ count: leagues.length }, "Manual refresh triggered");

  const result: SyncSummary = await runAutoSync(leagues);

  res.json({
    success: result.errors.length === 0,
    leaguesSynced: result.leaguesSynced,
    playersSynced: result.playersSynced,
    errors: result.errors,
    lastSyncAt: new Date().toISOString(),
  });
});

export default router;
