import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leaguesTable, teamsTable, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

router.get("/leagues", async (req, res): Promise<void> => {
  const sport = typeof req.query.sport === "string" ? req.query.sport : undefined;
  const leagues = await (sport
    ? db.select().from(leaguesTable).where(eq(leaguesTable.sport, sport)).orderBy(leaguesTable.createdAt)
    : db.select().from(leaguesTable).orderBy(leaguesTable.createdAt));
  res.json(ListLeaguesResponse.parse(leagues));
});

router.get("/leagues/:id", async (req, res): Promise<void> => {
  const params = GetLeagueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [league] = await db.select().from(leaguesTable).where(eq(leaguesTable.id, params.data.id));
  if (!league) {
    res.status(404).json({ error: "League not found" });
    return;
  }
  res.json(GetLeagueResponse.parse(league));
});

router.get("/leagues/:leagueId/teams", async (req, res): Promise<void> => {
  const params = ListTeamsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const teams = await db.select().from(teamsTable).where(eq(teamsTable.leagueId, params.data.leagueId));
  res.json(ListTeamsResponse.parse(teams));
});

router.get("/teams/:id", async (req, res): Promise<void> => {
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

router.get("/teams/:teamId/players", async (req, res): Promise<void> => {
  const params = ListTeamPlayersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const players = await db.select().from(playersTable).where(eq(playersTable.teamId, params.data.teamId));
  res.json(ListTeamPlayersResponse.parse(players));
});

export default router;
