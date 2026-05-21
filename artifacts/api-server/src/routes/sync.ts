import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leaguesTable, teamsTable, playersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { SyncEspnBody, SyncEspnResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SPORT_TO_GAME_ID: Record<string, string> = {
  football: "ffl",
  basketball: "fba",
  baseball: "flb",
  hockey: "fhl",
};

const ALL_GAME_IDS = [
  { gameId: "fba", sport: "basketball" },
  { gameId: "ffl", sport: "football" },
  { gameId: "flb", sport: "baseball" },
  { gameId: "fhl", sport: "hockey" },
];

router.post("/sync-espn", async (req, res): Promise<void> => {
  const parsed = SyncEspnBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { s2, swid, leagueId, sport } = parsed.data;

  if (!leagueId) {
    res.status(400).json({
      error:
        "League ID is required. Find it in your ESPN league URL: fantasy.espn.com/[sport]/league?leagueId=XXXXXXX",
    });
    return;
  }

  req.log.info({ leagueId, sport }, "Starting ESPN sync");

  try {
    const espnLeagues = await fetchEspnLeagues(s2, swid, leagueId, sport ?? undefined);

    let leaguesSynced = 0;
    let playersSynced = 0;

    for (const espnLeague of espnLeagues) {
      const [existing] = await db
        .select()
        .from(leaguesTable)
        .where(eq(leaguesTable.espnLeagueId, String(espnLeague.id)));

      let dbLeagueId: number;

      if (existing) {
        await db
          .update(leaguesTable)
          .set({
            name: espnLeague.settings?.name ?? `League ${espnLeague.id}`,
            season: espnLeague.seasonId ?? new Date().getFullYear(),
            teamCount: espnLeague.teams?.length ?? null,
            syncedAt: new Date(),
          })
          .where(eq(leaguesTable.id, existing.id));
        dbLeagueId = existing.id;
      } else {
        const [inserted] = await db
          .insert(leaguesTable)
          .values({
            espnLeagueId: String(espnLeague.id),
            name: espnLeague.settings?.name ?? `League ${espnLeague.id}`,
            season: espnLeague.seasonId ?? new Date().getFullYear(),
            sport: espnLeague.sport ?? sport ?? "football",
            teamCount: espnLeague.teams?.length ?? null,
            syncedAt: new Date(),
          })
          .returning();
        dbLeagueId = inserted!.id;
      }
      leaguesSynced++;

      for (const espnTeam of espnLeague.teams ?? []) {
        const [existingTeam] = await db
          .select()
          .from(teamsTable)
          .where(
            and(
              eq(teamsTable.leagueId, dbLeagueId),
              eq(teamsTable.espnTeamId, String(espnTeam.id))
            )
          );

        let dbTeamId: number;
        const teamData = {
          leagueId: dbLeagueId,
          espnTeamId: String(espnTeam.id),
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
          const [insertedTeam] = await db.insert(teamsTable).values(teamData).returning();
          dbTeamId = insertedTeam!.id;
        }

        for (const entry of espnTeam.roster?.entries ?? []) {
          const player = entry.playerPoolEntry?.player;
          if (!player) continue;

          const detectedSport = espnLeague.sport ?? sport ?? "football";
          const playerData = {
            teamId: dbTeamId,
            espnPlayerId: String(player.id),
            fullName: player.fullName ?? `Player ${player.id}`,
            position: getPositionName(entry.lineupSlotId ?? 0, detectedSport),
            proTeam: getProTeamAbbrev(player.proTeamId ?? 0, detectedSport),
            projectedPoints: entry.playerPoolEntry?.appliedStatTotal ?? null,
            avgPoints: entry.playerPoolEntry?.averageDraftPosition ?? null,
            totalPoints: entry.playerPoolEntry?.appliedStatTotal ?? null,
            injuryStatus: player.injuryStatus ?? null,
          };

          const [existingPlayer] = await db
            .select()
            .from(playersTable)
            .where(
              and(
                eq(playersTable.teamId, dbTeamId),
                eq(playersTable.espnPlayerId, String(player.id))
              )
            );

          if (existingPlayer) {
            await db.update(playersTable).set(playerData).where(eq(playersTable.id, existingPlayer.id));
          } else {
            await db.insert(playersTable).values(playerData);
            playersSynced++;
          }
        }
      }
    }

    const result = SyncEspnResponse.parse({
      success: true,
      message: `Synced ${leaguesSynced} league(s) and ${playersSynced} player(s)`,
      leaguesSynced,
      playersSynced,
      lastSyncAt: new Date().toISOString(),
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "ESPN sync failed");
    res.status(400).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

function espnHeaders(s2: string, swid: string): Record<string, string> {
  return {
    "Cookie": `espn_s2=${encodeURIComponent(s2)}; SWID=${swid}`,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://fantasy.espn.com/",
    "Origin": "https://fantasy.espn.com",
    "X-Fantasy-Source": "kona",
    "X-Fantasy-Platform": "kona-PROD-2ba39f35c29c3de0f14e42e66ffa2a1dff5c45b7",
    "Connection": "keep-alive",
    "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
}

// ESPN has two API hosts — try both
const ESPN_HOSTS = [
  "https://lm-api-reads.fantasy.espn.com",
  "https://fantasy.espn.com",
];

async function fetchEspnLeagues(
  s2: string,
  swid: string,
  leagueId: number,
  sport?: string
): Promise<EspnLeagueData[]> {
  const currentYear = new Date().getFullYear();
  // Basketball season year = the year it ends (2024-25 season → 2025)
  const years = [currentYear, currentYear - 1, currentYear + 1];

  const gameIdsToTry = sport && SPORT_TO_GAME_ID[sport]
    ? [{ gameId: SPORT_TO_GAME_ID[sport]!, sport }]
    : ALL_GAME_IDS;

  const headers = espnHeaders(s2, swid);
  const lastError: string[] = [];

  for (const { gameId, sport: sportName } of gameIdsToTry) {
    for (const host of ESPN_HOSTS) {
      for (const year of years) {
        const url = `${host}/apis/v3/games/${gameId}/seasons/${year}/segments/0/leagues/${leagueId}?view=mTeam&view=mRoster&view=mSettings&view=mStandings`;
        const label = `${sportName}/${year} (${host.includes("lm-api") ? "new" : "old"})`;

        try {
          logger.info({ url: url.replace(s2.slice(0, 10), "***") }, "Trying ESPN endpoint");

          const resp = await fetch(url, { headers });

          const contentType = resp.headers.get("content-type") ?? "";
          const isJson = contentType.includes("application/json") || contentType.includes("text/plain");

          if (!resp.ok) {
            const body = isJson ? await resp.text() : "(html)";
            lastError.push(`${label}: HTTP ${resp.status} ${body.slice(0, 80)}`);
            continue;
          }

          if (!isJson) {
            lastError.push(`${label}: returned HTML — cookies may be expired or blocked`);
            continue;
          }

          const data = (await resp.json()) as EspnLeagueData;

          if (!data || (typeof data !== "object")) {
            lastError.push(`${label}: empty/invalid JSON`);
            continue;
          }

          // ESPN returns an error object with "error" key on invalid league/auth
          if ("error" in data) {
            lastError.push(`${label}: ESPN error — ${JSON.stringify((data as Record<string, unknown>).error)}`);
            continue;
          }

          logger.info({ gameId, year, leagueId, host }, "ESPN sync succeeded");
          return [{ ...data, id: leagueId, sport: sportName }];
        } catch (e) {
          lastError.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  const sportHint = sport ? `for ${sport}` : "for any sport";

  throw new Error(
    `Could not reach ESPN Fantasy API for league ${leagueId} ${sportHint}. ` +
      `ESPN is blocking server requests or the cookies are expired. ` +
      `Details: ${lastError.slice(0, 4).join(" | ")}. ` +
      `Tip: Log out of ESPN, log back in, then copy fresh espn_s2 and SWID cookies.`
  );
}

interface EspnLeagueData {
  id?: number;
  seasonId?: number;
  sport?: string;
  settings?: { name?: string };
  teams?: EspnTeamData[];
}

interface EspnTeamData {
  id?: number;
  name?: string;
  abbrev?: string;
  wavierRank?: number;
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
    };
  };
}

function getPositionName(slotId: number, sport: string): string {
  if (sport === "basketball") {
    const positions: Record<number, string> = {
      0: "PG", 1: "SG", 2: "SF", 3: "PF", 4: "C",
      5: "SG/SF", 6: "SF/PF", 11: "UTIL", 12: "BENCH", 13: "IR",
    };
    return positions[slotId] ?? "BENCH";
  }
  if (sport === "baseball") {
    const positions: Record<number, string> = {
      0: "C", 1: "1B", 2: "2B", 3: "3B", 4: "SS", 5: "OF", 6: "2B/SS",
      7: "1B/3B", 12: "UTIL", 13: "SP", 14: "RP", 15: "P", 16: "BENCH", 17: "IR",
    };
    return positions[slotId] ?? "BENCH";
  }
  if (sport === "hockey") {
    const positions: Record<number, string> = {
      0: "C", 1: "LW", 2: "RW", 3: "D", 4: "G",
      5: "UTIL", 12: "BENCH", 13: "IR",
    };
    return positions[slotId] ?? "BENCH";
  }
  // football
  const positions: Record<number, string> = {
    0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K",
    20: "BENCH", 21: "IR", 23: "FLEX",
  };
  return positions[slotId] ?? "BENCH";
}

function getProTeamAbbrev(teamId: number, sport: string): string {
  if (sport === "basketball") {
    const teams: Record<number, string> = {
      1: "ATL", 2: "BOS", 3: "NOP", 4: "CHI", 5: "CLE", 6: "DAL",
      7: "DEN", 8: "DET", 9: "GSW", 10: "HOU", 11: "IND", 12: "LAC",
      13: "LAL", 14: "MIA", 15: "MIL", 16: "MIN", 17: "BKN", 18: "NYK",
      19: "ORL", 20: "PHI", 21: "PHX", 22: "POR", 23: "SAC", 24: "SAS",
      25: "OKC", 26: "UTA", 27: "WAS", 28: "TOR", 29: "MEM", 30: "CHA",
    };
    return teams[teamId] ?? "FA";
  }
  // NFL
  const teams: Record<number, string> = {
    1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
    8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "OAK", 14: "LAR",
    15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ",
    21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA",
    27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
  };
  return teams[teamId] ?? "FA";
}

export default router;
