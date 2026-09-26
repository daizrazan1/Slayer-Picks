import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leaguesTable, teamsTable, playersTable, waiverPlayersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth";
import { enrichLeaguePlayers } from "../lib/espn-public";
import { footballLineupSlot, footballPlayerPosition } from "../lib/espn-position";
import { getCurrentEspnWeek, getWeeklyPlayerPoints, saveCurrentMatchups, type EspnWeeklyLeague } from "../lib/espn-weekly";
const router: IRouter = Router();

router.post("/sync-espn-push", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as { sport?: unknown; leagueId?: unknown; teamId?: unknown; espnData?: unknown; waiverData?: unknown; waiverError?: unknown };

  const sport = typeof body.sport === "string" ? body.sport : "basketball";
  const leagueId = typeof body.leagueId === "number" ? body.leagueId : parseInt(String(body.leagueId ?? ""), 10);
  const espnData = body.espnData as Record<string, unknown> | undefined;
  const ownerTeamId = typeof body.teamId === "number" ? body.teamId : parseInt(String(body.teamId ?? ""), 10);
  const userId = req.session.userId!;

  if (!leagueId || isNaN(leagueId)) {
    res.status(400).json({ error: "leagueId is required and must be a number" });
    return;
  }
  if (!espnData || typeof espnData !== "object") {
    res.status(400).json({ error: "espnData is required" });
    return;
  }
  if (Number(espnData.id) !== leagueId) {
    res.status(400).json({ error: "ESPN league ID does not match the imported data" });
    return;
  }

  req.log.info({ leagueId, sport }, "Processing browser-pushed ESPN data");

  try {
    const result = await processEspnData(espnData, leagueId, sport, userId, ownerTeamId);
    let waiverPlayersSynced: number | null = null;
    let waiverError = typeof body.waiverError === "string" ? body.waiverError.slice(0, 200) : null;
    if (Array.isArray(body.waiverData)) {
      try {
        waiverPlayersSynced = await replaceWaiverPlayers(result.dbLeagueId, body.waiverData.slice(0, 250), sport, result.seasonId);
      } catch (error) {
        waiverError = "Available players could not be imported. Your roster was updated.";
        req.log.error({ err: error }, "Waiver player import failed");
      }
    }

    res.json({
      success: true,
      message: `Synced ${result.leaguesSynced} league(s), ${result.playersSynced} rostered players${waiverPlayersSynced === null ? "" : `, ${waiverPlayersSynced} available players`}, and ${result.matchupsSynced} current matchups`,
      leaguesSynced: result.leaguesSynced,
      playersSynced: result.playersSynced,
      waiverPlayersSynced,
      matchupsSynced: result.matchupsSynced,
      waiverError,
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
  ownerTeamId: number
): Promise<{ leaguesSynced: number; playersSynced: number; dbLeagueId: number; matchupsSynced: number; seasonId: number }> {
  const teams = (raw["teams"] as EspnTeamData[] | undefined) ?? [];
  const weeklyData = raw as EspnWeeklyLeague;
  const currentWeek = sport === "football" ? getCurrentEspnWeek(weeklyData) : null;
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
      .set({
        name: leagueName, season: seasonId, teamCount: teams.length, syncedAt: new Date(),
      })
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
        autoSyncEnabled: false,
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
    const isOwnerTeam = ownerTeamId > 0 ? espnTeam.id === ownerTeamId : existingTeam?.isOwnerTeam ?? false;
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
          position: sport === "football"
            ? footballPlayerPosition(player.defaultPositionId) ?? getPositionName(entry.lineupSlotId ?? 0, sport)
            : getPositionName(entry.lineupSlotId ?? 0, sport),
          lineupSlot: sport === "football"
            ? footballLineupSlot(entry.lineupSlotId)
            : entry.lineupSlotId == null ? null : getPositionName(entry.lineupSlotId, sport),
          proTeam: getProTeamAbbrev(player.proTeamId ?? 0, sport),
          projectedPoints: getWeeklyPlayerPoints(player.stats, currentWeek, 1, seasonId),
          weeklyPoints: getWeeklyPlayerPoints(player.stats, currentWeek, 0, seasonId),
          avgPoints: null,
          totalPoints: getSeasonTotal(player.stats, seasonId) ?? entry.playerPoolEntry?.appliedStatTotal ?? null,
          injuryStatus: player.injuryStatus ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (playerRows.length > 0) {
      await db.insert(playersTable).values(playerRows);
      playersSynced += playerRows.length;
    }
  }

  const matchupsSynced = sport === "football" ? await saveCurrentMatchups(dbLeagueId, weeklyData) : 0;
  return { leaguesSynced: 1, playersSynced, dbLeagueId, matchupsSynced, seasonId };
}

interface EspnWaiverEntry {
  id?: number;
  onTeamId?: number;
  status?: string;
  player?: {
    id?: number; fullName?: string; defaultPositionId?: number; proTeamId?: number;
    injuryStatus?: string; stats?: Array<EspnStatEntry & { statSourceId?: number }>;
    ownership?: { percentOwned?: number; percentStarted?: number };
  };
  playerPoolEntry?: {
    player?: EspnWaiverEntry["player"];
    status?: string;
    ownership?: { percentOwned?: number; percentStarted?: number };
    appliedStatTotal?: number;
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function playerPosition(positionId: number | undefined, sport: string): string {
  if (sport === "football") {
    return footballPlayerPosition(positionId) ?? "Other";
  }
  return String(positionId ?? "Other");
}

async function replaceWaiverPlayers(leagueId: number, entries: EspnWaiverEntry[], sport: string, seasonId: number): Promise<number> {
  const seen = new Set<string>();
  const syncedAt = new Date();
  const rows = entries.flatMap((entry) => {
    const player = entry.player ?? entry.playerPoolEntry?.player;
    const id = player?.id ?? entry.id;
    if (!id || !player?.fullName || seen.has(String(id)) || (entry.onTeamId ?? 0) > 0) return [];
    seen.add(String(id));
    const projected = player.stats?.find(s => s.statSourceId === 1 && s.statSplitTypeId === 0 && s.scoringPeriodId === 0);
    return [{
      leagueId,
      espnPlayerId: String(id),
      fullName: player.fullName,
      position: playerPosition(player.defaultPositionId, sport),
      proTeam: getProTeamAbbrev(player.proTeamId ?? 0, sport),
      availability: (entry.status ?? entry.playerPoolEntry?.status) === "WAIVERS" ? "WAIVERS" : "FREEAGENT",
      percentOwned: finiteNumber(player.ownership?.percentOwned ?? entry.playerPoolEntry?.ownership?.percentOwned),
      percentStarted: finiteNumber(player.ownership?.percentStarted ?? entry.playerPoolEntry?.ownership?.percentStarted),
      projectedPoints: finiteNumber(projected?.appliedTotal),
      totalPoints: finiteNumber(getSeasonTotal(player.stats, seasonId) ?? entry.playerPoolEntry?.appliedStatTotal),
      injuryStatus: player.injuryStatus ?? null,
      syncedAt,
    }];
  });
  if (entries.length > 0 && rows.length === 0) throw new Error("ESPN available player format was not recognized");
  await db.transaction(async (tx) => {
    await tx.delete(waiverPlayersTable).where(eq(waiverPlayersTable.leagueId, leagueId));
    if (rows.length) await tx.insert(waiverPlayersTable).values(rows);
  });
  return rows.length;
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
  statSourceId?: number;
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
      defaultPositionId?: number;
      injuryStatus?: string;
      stats?: EspnStatEntry[];
    };
  };
}

function getSeasonTotal(stats: EspnStatEntry[] | undefined, seasonId: number): number | null {
  if (!stats || stats.length === 0) return null;
  const entry = stats.find(s => s.seasonId === seasonId && s.statSourceId === 0 && s.statSplitTypeId === 0 && s.scoringPeriodId === 0)
    ?? stats.find(s => s.seasonId == null && s.statSourceId === 0 && s.statSplitTypeId === 0 && s.scoringPeriodId === 0);
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
