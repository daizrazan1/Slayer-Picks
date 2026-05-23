import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leaguesTable, teamsTable, playersTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth";
import { enrichLeaguePlayers } from "../lib/espn-public";
import {
  GetLeagueParams,
  GetLeagueResponse,
  ListLeaguesResponse,
  ListTeamsParams,
  ListTeamsResponse,
  GetTeamParams,
  GetTeamResponse,
  ListTeamPlayersParams,
  ListTeamPlayersResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/leagues", requireAuth, async (req, res): Promise<void> => {
  const sport = typeof req.query.sport === "string" ? req.query.sport : undefined;
  const userId = req.session.userId!;
  const leagues = await (sport
    ? db.select().from(leaguesTable).where(and(eq(leaguesTable.userId, userId), eq(leaguesTable.sport, sport))).orderBy(leaguesTable.createdAt)
    : db.select().from(leaguesTable).where(eq(leaguesTable.userId, userId)).orderBy(leaguesTable.createdAt));
  res.json(ListLeaguesResponse.parse(leagues));
});

router.get("/leagues/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetLeagueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [league] = await db.select().from(leaguesTable).where(and(eq(leaguesTable.id, params.data.id), eq(leaguesTable.userId, userId)));
  if (!league) {
    res.status(404).json({ error: "League not found" });
    return;
  }
  res.json(GetLeagueResponse.parse(league));
});

router.post("/leagues/:id/enrich", requireAuth, async (req, res): Promise<void> => {
  const params = GetLeagueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [league] = await db
    .select()
    .from(leaguesTable)
    .where(and(eq(leaguesTable.id, params.data.id), eq(leaguesTable.userId, userId)));
  if (!league) {
    res.status(404).json({ error: "League not found" });
    return;
  }
  res.json({ success: true, message: "Enrichment started in background" });
  enrichLeaguePlayers(league.id, league.sport).catch((err: unknown) => {
    req.log.error({ err, leagueId: league.id }, "Background enrichment failed");
  });
});

router.delete("/leagues/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetLeagueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [league] = await db.select().from(leaguesTable).where(and(eq(leaguesTable.id, params.data.id), eq(leaguesTable.userId, userId)));
  if (!league) {
    res.status(404).json({ error: "League not found" });
    return;
  }
  const teams = await db.select({ id: teamsTable.id }).from(teamsTable).where(eq(teamsTable.leagueId, league.id));
  const teamIds = teams.map(t => t.id);
  if (teamIds.length > 0) {
    await db.delete(playersTable).where(inArray(playersTable.teamId, teamIds));
  }
  await db.delete(teamsTable).where(eq(teamsTable.leagueId, league.id));
  await db.delete(leaguesTable).where(eq(leaguesTable.id, league.id));
  res.json({ success: true, message: "League deleted" });
});

router.get("/leagues/:leagueId/teams", requireAuth, async (req, res): Promise<void> => {
  const params = ListTeamsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [league] = await db.select().from(leaguesTable).where(and(eq(leaguesTable.id, params.data.leagueId), eq(leaguesTable.userId, userId)));
  if (!league) {
    res.status(404).json({ error: "League not found" });
    return;
  }
  const teams = await db.select().from(teamsTable).where(eq(teamsTable.leagueId, params.data.leagueId));
  res.json(ListTeamsResponse.parse(teams));
});

router.get("/teams/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, params.data.id));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  res.json(GetTeamResponse.parse(team));
});

router.get("/teams/:teamId/players", requireAuth, async (req, res): Promise<void> => {
  const params = ListTeamPlayersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const players = await db.select().from(playersTable).where(eq(playersTable.teamId, params.data.teamId));
  res.json(ListTeamPlayersResponse.parse(players));
});

export default router;
