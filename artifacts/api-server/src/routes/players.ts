import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { playersTable, teamsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ListPlayersQueryParams, ListPlayersResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/players", async (req, res): Promise<void> => {
  const query = ListPlayersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { leagueId, position } = query.data;

  if (leagueId) {
    const teams = await db.select().from(teamsTable).where(eq(teamsTable.leagueId, leagueId));
    const teamIds = teams.map(t => t.id);
    if (teamIds.length === 0) {
      res.json([]);
      return;
    }
    let players = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.teamId, teamIds[0]!))
      .orderBy(desc(playersTable.avgPoints));

    if (teamIds.length > 1) {
      const all = await db.select().from(playersTable).orderBy(desc(playersTable.avgPoints));
      players = all.filter(p => teamIds.includes(p.teamId));
    }

    const filtered = position ? players.filter(p => p.position === position) : players;
    res.json(ListPlayersResponse.parse(filtered));
    return;
  }

  const players = await db.select().from(playersTable).orderBy(desc(playersTable.avgPoints));
  const filtered = position ? players.filter(p => p.position === position) : players;
  res.json(ListPlayersResponse.parse(filtered));
});

export default router;
