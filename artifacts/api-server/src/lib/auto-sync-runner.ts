import { db } from "@workspace/db";
import { leaguesTable, teamsTable, playersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

export interface SyncSummary {
  leaguesSynced: number;
  playersSynced: number;
  errors: string[];
}

const SPORT_TO_GAME_ID: Record<string, string> = {
  football: "ffl",
  basketball: "fba",
  baseball: "flb",
  hockey: "fhl",
};

const ESPN_HOSTS = [
  "https://lm-api-reads.fantasy.espn.com",
  "https://fantasy.espn.com",
];

type LeagueRow = typeof leaguesTable.$inferSelect;

export async function runAutoSync(leagues: LeagueRow[]): Promise<SyncSummary> {
  let leaguesSynced = 0;
  let playersSynced = 0;
  const errors: string[] = [];

  for (const league of leagues) {
    if (!league.espnS2 || !league.swid) continue;

    try {
      const result = await syncOneLeague(league);
      leaguesSynced++;
      playersSynced += result.playersSynced;

      await db
        .update(leaguesTable)
        .set({ lastAutoSyncAt: new Date(), lastAutoSyncError: null, syncedAt: new Date() })
        .where(eq(leaguesTable.id, league.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${league.name}: ${msg}`);
      logger.error({ leagueId: league.id, err }, "Auto-sync failed for league");

      await db
        .update(leaguesTable)
        .set({ lastAutoSyncError: msg })
        .where(eq(leaguesTable.id, league.id));
    }
  }

  return { leaguesSynced, playersSynced, errors };
}

async function syncOneLeague(league: LeagueRow): Promise<{ playersSynced: number }> {
  const s2 = league.espnS2!;
  const swid = league.swid!;
  const espnLeagueId = parseInt(league.espnLeagueId, 10);
  const sport = league.sport;
  const gameId = SPORT_TO_GAME_ID[sport] ?? "ffl";

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear - 1];

  const headers = {
    Cookie: `espn_s2=${encodeURIComponent(s2)}; SWID=${swid}`,
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Referer: "https://fantasy.espn.com/",
    Origin: "https://fantasy.espn.com",
    "X-Fantasy-Source": "kona",
    "X-Fantasy-Platform": "kona-PROD-2ba39f35c29c3de0f14e42e66ffa2a1dff5c45b7",
  };

  let data: Record<string, unknown> | null = null;

  for (const host of ESPN_HOSTS) {
    for (const year of years) {
      const url = `${host}/apis/v3/games/${gameId}/seasons/${year}/segments/0/leagues/${espnLeagueId}?view=mTeam&view=mRoster&view=mSettings&view=mStandings`;
      try {
        const resp = await fetch(url, { headers });
        const ct = resp.headers.get("content-type") ?? "";
        if (!resp.ok || !ct.includes("application/json")) continue;
        const json = (await resp.json()) as Record<string, unknown>;
        if (!json || "error" in json) continue;
        data = json;
        break;
      } catch {
        continue;
      }
    }
    if (data) break;
  }

  if (!data) {
    throw new Error("ESPN API unreachable or credentials expired");
  }

  const teams = (data["teams"] as EspnTeam[] | undefined) ?? [];
  let playersSynced = 0;

  for (const espnTeam of teams) {
    const [existingTeam] = await db
      .select()
      .from(teamsTable)
      .where(and(eq(teamsTable.leagueId, league.id), eq(teamsTable.espnTeamId, String(espnTeam.id ?? ""))));

    let dbTeamId: number;
    const teamData = {
      leagueId: league.id,
      espnTeamId: String(espnTeam.id ?? ""),
      name: espnTeam.name ?? espnTeam.abbrev ?? `Team ${espnTeam.id}`,
      abbrev: espnTeam.abbrev ?? `T${espnTeam.id}`,
      wins: espnTeam.record?.overall?.wins ?? 0,
      losses: espnTeam.record?.overall?.losses ?? 0,
      ties: espnTeam.record?.overall?.ties ?? 0,
      pointsFor: espnTeam.record?.overall?.pointsFor ?? null,
      pointsAgainst: espnTeam.record?.overall?.pointsAgainst ?? null,
      waiversPosition: espnTeam.wavierRank ?? null,
    };

    if (existingTeam) {
      await db.update(teamsTable).set(teamData).where(eq(teamsTable.id, existingTeam.id));
      dbTeamId = existingTeam.id;
    } else {
      const [inserted] = await db.insert(teamsTable).values(teamData).returning();
      dbTeamId = inserted!.id;
    }

    await db.delete(playersTable).where(eq(playersTable.teamId, dbTeamId));

    const playerRows = (espnTeam.roster?.entries ?? [])
      .map((entry) => {
        const player = entry.playerPoolEntry?.player;
        if (!player) return null;
        return {
          teamId: dbTeamId,
          espnPlayerId: String(player.id ?? ""),
          fullName: player.fullName ?? `Player ${player.id}`,
          position: getPositionName(entry.lineupSlotId ?? 0, sport),
          proTeam: getProTeamAbbrev(player.proTeamId ?? 0, sport),
          projectedPoints: entry.playerPoolEntry?.appliedStatTotal ?? null,
          avgPoints: null,
          totalPoints: entry.playerPoolEntry?.appliedStatTotal ?? null,
          injuryStatus: player.injuryStatus ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (playerRows.length > 0) {
      await db.insert(playersTable).values(playerRows);
      playersSynced += playerRows.length;
    }
  }

  return { playersSynced };
}

interface EspnTeam {
  id?: number;
  name?: string;
  abbrev?: string;
  wavierRank?: number;
  record?: { overall?: { wins?: number; losses?: number; ties?: number; pointsFor?: number; pointsAgainst?: number } };
  roster?: { entries?: EspnRosterEntry[] };
}
interface EspnRosterEntry {
  lineupSlotId?: number;
  playerPoolEntry?: { appliedStatTotal?: number; player?: { id?: number; fullName?: string; proTeamId?: number; injuryStatus?: string } };
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
