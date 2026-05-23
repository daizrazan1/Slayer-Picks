import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leaguesTable, teamsTable, playersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth";
import { enrichLeaguePlayers } from "../lib/espn-public";
const router: IRouter = Router();

router.post("/sync-espn-push", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as { sport?: unknown; leagueId?: unknown; espnData?: unknown; swid?: unknown };

  const sport = typeof body.sport === "string" ? body.sport : "basketball";
  const leagueId = typeof body.leagueId === "number" ? body.leagueId : parseInt(String(body.leagueId ?? ""), 10);
  const espnData = body.espnData as Record<string, unknown> | undefined;
  const swid = typeof body.swid === "string" ? body.swid.trim() : "";
  const userId = req.session.userId!;

  if (!leagueId || isNaN(leagueId)) {
    res.status(400).json({ error: "leagueId is required and must be a number" });
    return;
  }
  if (!espnData || typeof espnData !== "object") {
    res.status(400).json({ error: "espnData is required" });
    return;
  }

  req.log.info({ leagueId, sport }, "Processing browser-pushed ESPN data");

  try {
    const result = await processEspnData(espnData, leagueId, sport, userId, swid);

    res.json({
      success: true,
      message: `Synced ${result.leaguesSynced} league(s) and ${result.playersSynced} players`,
      leaguesSynced: result.leaguesSynced,
      playersSynced: result.playersSynced,
      lastSyncAt: new Date().toISOString(),
    });
    enrichLeaguePlayers(result.dbLeagueId, sport).catch((err: unknown) => {
      req.log.error({ err, leagueId: result.dbLeagueId }, "Background enrichment failed after push sync");
    });
  } catch (err) {
    req.log.error({ err }, "ESPN push sync failed");
    res.status(400).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

async function processEspnData(
  raw: Record<string, unknown>,
  leagueId: number,
  sport: string,
  userId: number,
  swid: string = ""
): Promise<{ leaguesSynced: number; playersSynced: number; dbLeagueId: number }> {
  const teams = (raw["teams"] as EspnTeamData[] | undefined) ?? [];
  const settings = raw["settings"] as { name?: string } | undefined;
  const seasonId = (raw["seasonId"] as number | undefined) ?? new Date().getFullYear();

  const leagueName = settings?.name ?? `League ${leagueId}`;

  const [existing] = await db
    .select()
    .from(leaguesTable)
    .where(and(eq(leaguesTable.espnLeagueId, String(leagueId)), eq(leaguesTable.userId, userId)));

  let dbLeagueId: number;

  if (existing) {
    await db
      .update(leaguesTable)
      .set({ name: leagueName, season: seasonId, teamCount: teams.length, syncedAt: new Date(), autoSyncEnabled: true })
      .where(eq(leaguesTable.id, existing.id));
    dbLeagueId = existing.id;
  } else {
    const [inserted] = await db
      .insert(leaguesTable)
      .values({
        userId,
        espnLeagueId: String(leagueId),
        name: leagueName,
        season: seasonId,
        sport,
        teamCount: teams.length,
        syncedAt: new Date(),
        autoSyncEnabled: true,
      })
      .returning();
    dbLeagueId = inserted!.id;
  }

  let playersSynced = 0;

  for (const espnTeam of teams) {
    const [existingTeam] = await db
      .select()
      .from(teamsTable)
      .where(
        and(
          eq(teamsTable.leagueId, dbLeagueId),
          eq(teamsTable.espnTeamId, String(espnTeam.id ?? ""))
        )
      );

    let dbTeamId: number;
    const isOwnerTeam = !!(swid && espnTeam.primaryOwner && espnTeam.primaryOwner === swid);
    const teamData = {
      leagueId: dbLeagueId,
      espnTeamId: String(espnTeam.id ?? ""),
      name: espnTeam.name ?? espnTeam.abbrev ?? `Team ${espnTeam.id}`,
      abbrev: espnTeam.abbrev ?? `T${espnTeam.id}`,
      wins: espnTeam.record?.overall?.wins ?? 0,
      losses: espnTeam.record?.overall?.losses ?? 0,
      ties: espnTeam.record?.overall?.ties ?? 0,
      pointsFor: espnTeam.record?.overall?.pointsFor ?? null,
      pointsAgainst: espnTeam.record?.overall?.pointsAgainst ?? null,
      waiversPosition: espnTeam.wavierRank ?? null,
      isOwnerTeam,
    };

    if (existingTeam) {
      await db.update(teamsTable).set(teamData).where(eq(teamsTable.id, existingTeam.id));
      dbTeamId = existingTeam.id;
    } else {
      const [insertedTeam] = await db.insert(teamsTable).values(teamData).returning();
      dbTeamId = insertedTeam!.id;
    }

    // Wipe the team's roster and re-insert fresh so traded/dropped players are cleared
    await db.delete(playersTable).where(eq(playersTable.teamId, dbTeamId));

    const entries = espnTeam.roster?.entries ?? [];
    const playerRows = entries
      .map((entry) => {
        const player = entry.playerPoolEntry?.player;
        if (!player) return null;
        return {
          teamId: dbTeamId,
          espnPlayerId: String(player.id ?? ""),
          fullName: player.fullName ?? `Player ${player.id}`,
          position: getPositionName(entry.lineupSlotId ?? 0, sport),
          proTeam: getProTeamAbbrev(player.proTeamId ?? 0, sport),
          projectedPoints: null,
          avgPoints: null,
          totalPoints: getSeasonTotal(player.stats) ?? entry.playerPoolEntry?.appliedStatTotal ?? null,
          injuryStatus: player.injuryStatus ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (playerRows.length > 0) {
      await db.insert(playersTable).values(playerRows);
      playersSynced += playerRows.length;
    }
  }

  return { leaguesSynced: 1, playersSynced, dbLeagueId };
}

interface EspnTeamData {
  id?: number;
  name?: string;
  abbrev?: string;
  wavierRank?: number;
  primaryOwner?: string;
  record?: {
    overall?: {
      wins?: number;
      losses?: number;
      ties?: number;
      pointsFor?: number;
      pointsAgainst?: number;
    };
  };
  roster?: { entries?: EspnRosterEntry[] };
}

interface EspnStatEntry {
  appliedTotal?: number;
  scoringPeriodId?: number;
  seasonId?: number;
  statSplitTypeId?: number;
}

interface EspnRosterEntry {
  lineupSlotId?: number;
  playerPoolEntry?: {
    appliedStatTotal?: number;
    averageDraftPosition?: number;
    player?: {
      id?: number;
      fullName?: string;
      proTeamId?: number;
      injuryStatus?: string;
      stats?: EspnStatEntry[];
    };
  };
}

function getSeasonTotal(stats?: EspnStatEntry[]): number | null {
  if (!stats || stats.length === 0) return null;
  const entry = stats.find(s => s.statSplitTypeId === 0 && s.scoringPeriodId === 0);
  return entry?.appliedTotal ?? null;
}

function getPositionName(slotId: number, sport: string): string {
  if (sport === "basketball") {
    const p: Record<number, string> = { 0: "PG", 1: "SG", 2: "SF", 3: "PF", 4: "C", 5: "SG/SF", 6: "SF/PF", 11: "UTIL", 12: "BENCH", 13: "IR" };
    return p[slotId] ?? "BENCH";
  }
  if (sport === "baseball") {
    const p: Record<number, string> = { 0: "C", 1: "1B", 2: "2B", 3: "3B", 4: "SS", 5: "OF", 12: "UTIL", 13: "SP", 14: "RP", 15: "P", 16: "BENCH", 17: "IR" };
    return p[slotId] ?? "BENCH";
  }
  if (sport === "hockey") {
    const p: Record<number, string> = { 0: "C", 1: "LW", 2: "RW", 3: "D", 4: "G", 5: "UTIL", 12: "BENCH", 13: "IR" };
    return p[slotId] ?? "BENCH";
  }
  const p: Record<number, string> = { 0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K", 20: "BENCH", 21: "IR", 23: "FLEX" };
  return p[slotId] ?? "BENCH";
}

function getProTeamAbbrev(teamId: number, sport: string): string {
  if (sport === "basketball") {
    const t: Record<number, string> = { 1: "ATL", 2: "BOS", 3: "NOP", 4: "CHI", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GSW", 10: "HOU", 11: "IND", 12: "LAC", 13: "LAL", 14: "MIA", 15: "MIL", 16: "MIN", 17: "BKN", 18: "NYK", 19: "ORL", 20: "PHI", 21: "PHX", 22: "POR", 23: "SAC", 24: "SAS", 25: "OKC", 26: "UTA", 27: "WAS", 28: "TOR", 29: "MEM", 30: "CHA" };
    return t[teamId] ?? "FA";
  }
  const t: Record<number, string> = { 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "OAK", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" };
  return t[teamId] ?? "FA";
}

export default router;
