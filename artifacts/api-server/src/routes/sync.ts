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

async function fetchEspnLeagues(
  s2: string,
  swid: string,
  leagueId: number,
  sport?: string
): Promise<EspnLeagueData[]> {
  const cookieHeader = `espn_s2=${s2}; SWID=${swid}`;
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear - 1];

  const gameIdsToTry = sport && SPORT_TO_GAME_ID[sport]
    ? [{ gameId: SPORT_TO_GAME_ID[sport]!, sport }]
    : ALL_GAME_IDS;

  const lastError: string[] = [];

  for (const { gameId, sport: sportName } of gameIdsToTry) {
    for (const year of years) {
      const url = `https://fantasy.espn.com/apis/v3/games/${gameId}/seasons/${year}/segments/0/leagues/${leagueId}?view=mTeam&view=mRoster&view=mSettings`;

      try {
        const resp = await fetch(url, {
          headers: {
            Cookie: cookieHeader,
            Accept: "application/json",
            "X-Fantasy-Source": "kona",
            "X-Fantasy-Platform": "kona-PROD-2ba39f35c29c3de0f14e42e66ffa2a1dff5c45b7",
          },
        });

        const contentType = resp.headers.get("content-type") ?? "";

        if (!resp.ok) {
          lastError.push(`${sportName}/${year}: HTTP ${resp.status}`);
          continue;
        }

        if (!contentType.includes("application/json")) {
          lastError.push(`${sportName}/${year}: ESPN returned HTML (not JSON) — credentials may be expired`);
          continue;
        }

        const data = (await resp.json()) as EspnLeagueData;

        if (!data || (!data.teams && !data.settings)) {
          lastError.push(`${sportName}/${year}: empty response`);
          continue;
        }

        logger.info({ gameId, year, leagueId }, "ESPN sync succeeded");
        return [{ ...data, id: leagueId, sport: sportName }];
      } catch (e) {
        lastError.push(`${sportName}/${year}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const sportHint = sport
    ? `for ${sport}`
    : "for any sport (football, basketball, baseball, hockey)";

  throw new Error(
    `Could not find league ${leagueId} ${sportHint}. ` +
      `Attempts: ${lastError.slice(0, 3).join("; ")}. ` +
      `Check that your espn_s2 and SWID are current, and that this is the correct League ID ` +
      `(find it in your ESPN league URL: fantasy.espn.com/[sport]/league?leagueId=XXXXX).`
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
