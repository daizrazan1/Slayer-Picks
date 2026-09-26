import { Router, type IRouter } from "express";
import { db, leaguesTable, matchupsTable, playersTable, teamsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth";

const router: IRouter = Router();

router.get("/leagues/:id/weekly", requireAuth, async (req, res): Promise<void> => {
  const leagueId = Number(req.params.id);
  if (!Number.isInteger(leagueId) || leagueId < 1) {
    res.status(400).json({ error: "Invalid league ID" });
    return;
  }

  const [league] = await db.select().from(leaguesTable)
    .where(and(eq(leaguesTable.id, leagueId), eq(leaguesTable.userId, req.session.userId!)));
  if (!league) {
    res.status(404).json({ error: "League not found" });
    return;
  }

  const teams = await db.select().from(teamsTable).where(eq(teamsTable.leagueId, leagueId));
  const myTeam = teams.find((team) => team.isOwnerTeam) ?? null;
  const week = league.currentMatchupPeriod;
  const matchups = week
    ? await db.select().from(matchupsTable).where(and(eq(matchupsTable.leagueId, leagueId), eq(matchupsTable.week, week)))
    : [];
  const matchup = myTeam
    ? matchups.find((item) => item.homeTeamId === myTeam.id || item.awayTeamId === myTeam.id) ?? null
    : null;
  const opponentId = matchup && myTeam
    ? matchup.homeTeamId === myTeam.id ? matchup.awayTeamId : matchup.homeTeamId
    : null;
  const opponent = teams.find((team) => team.id === opponentId) ?? null;
  const teamIds = [myTeam?.id, opponent?.id].filter((id): id is number => id != null);
  const players = teamIds.length
    ? await db.select({
        id: playersTable.id,
        teamId: playersTable.teamId,
        espnPlayerId: playersTable.espnPlayerId,
        fullName: playersTable.fullName,
        position: playersTable.position,
        lineupSlot: playersTable.lineupSlot,
        proTeam: playersTable.proTeam,
        projectedPoints: playersTable.projectedPoints,
        weeklyPoints: playersTable.weeklyPoints,
        injuryStatus: playersTable.injuryStatus,
      }).from(playersTable).where(inArray(playersTable.teamId, teamIds))
    : [];

  res.json({
    league: { id: league.id, name: league.name, sport: league.sport, season: league.season },
    week,
    syncedAt: league.syncedAt.toISOString(),
    myTeam,
    opponent,
    matchup,
    myPlayers: players.filter((player) => player.teamId === myTeam?.id),
    opponentPlayers: players.filter((player) => player.teamId === opponent?.id),
  });
});

export default router;
