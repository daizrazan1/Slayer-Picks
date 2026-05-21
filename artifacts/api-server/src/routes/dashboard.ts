import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leaguesTable, teamsTable, playersTable, aiCacheTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { GetDashboardSummaryResponse, ListRecentTradesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [leagues, teams, players, tradeEvals] = await Promise.all([
    db.select().from(leaguesTable),
    db.select().from(teamsTable),
    db.select().from(playersTable).orderBy(desc(playersTable.avgPoints)).limit(5),
    db.select().from(aiCacheTable),
  ]);

  const lastSyncAt = leagues.length > 0
    ? leagues.sort((a, b) => b.syncedAt.getTime() - a.syncedAt.getTime())[0]!.syncedAt.toISOString()
    : null;

  const summary = GetDashboardSummaryResponse.parse({
    leagueCount: leagues.length,
    teamCount: teams.length,
    playerCount: players.length,
    tradeEvalCount: tradeEvals.length,
    lastSyncAt,
    topPlayers: players,
  });

  res.json(summary);
});

router.get("/dashboard/recent-trades", async (_req, res): Promise<void> => {
  const recent = await db
    .select()
    .from(aiCacheTable)
    .orderBy(desc(aiCacheTable.createdAt))
    .limit(10);

  const mapped = recent.map(r => {
    let parsed: { analysis?: string; winScoreA?: number; winScoreB?: number } = {};
    try {
      parsed = JSON.parse(r.response);
    } catch {
      parsed = {};
    }
    return {
      id: r.id,
      winScoreA: r.winScoreA ?? parsed.winScoreA ?? 50,
      winScoreB: r.winScoreB ?? parsed.winScoreB ?? 50,
      analysis: parsed.analysis ?? r.response,
      recommendation: r.recommendation ?? "Neutral",
      teamAName: r.teamAName ?? null,
      teamBName: r.teamBName ?? null,
      cached: false,
      evaluatedAt: r.createdAt.toISOString(),
    };
  });

  res.json(ListRecentTradesResponse.parse(mapped));
});

export default router;
