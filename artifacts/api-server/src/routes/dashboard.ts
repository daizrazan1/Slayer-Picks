import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leaguesTable, teamsTable, playersTable, aiCacheTable } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { GetDashboardSummaryResponse, ListRecentTradesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const sport = typeof req.query.sport === "string" ? req.query.sport : undefined;

  const leagues = await (sport
    ? db.select().from(leaguesTable).where(eq(leaguesTable.sport, sport))
    : db.select().from(leaguesTable));

  const leagueIds = leagues.map(l => l.id);

  const [teams, tradeEvals] = await Promise.all([
    leagueIds.length > 0
      ? db.select().from(teamsTable).where(inArray(teamsTable.leagueId, leagueIds))
      : Promise.resolve([]),
    db.select().from(aiCacheTable),
  ]);

  const teamIds = teams.map(t => t.id);

  const topPlayers = teamIds.length > 0
    ? await db.select().from(playersTable)
        .where(inArray(playersTable.teamId, teamIds))
        .orderBy(desc(playersTable.totalPoints))
        .limit(5)
    : [];

  const lastSyncAt = leagues.length > 0
    ? leagues.sort((a, b) => b.syncedAt.getTime() - a.syncedAt.getTime())[0]!.syncedAt.toISOString()
    : null;

  const summary = GetDashboardSummaryResponse.parse({
    leagueCount: leagues.length,
    teamCount: teams.length,
    playerCount: teamIds.length > 0
      ? (await db.select().from(playersTable).where(inArray(playersTable.teamId, teamIds))).length
      : 0,
    tradeEvalCount: tradeEvals.length,
    lastSyncAt,
    topPlayers,
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
