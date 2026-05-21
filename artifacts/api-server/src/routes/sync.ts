import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leaguesTable, teamsTable, playersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { SyncEspnBody, SyncEspnResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/sync-espn", async (req, res): Promise<void> => {
  const parsed = SyncEspnBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { s2, swid, leagueId } = parsed.data;

  req.log.info({ leagueId }, "Starting ESPN sync");

  try {
    const espnLeagues = await fetchEspnLeagues(s2, swid, leagueId ?? undefined);

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
            sport: espnLeague.sport ?? "football",
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

          const playerData = {
            teamId: dbTeamId,
            espnPlayerId: String(player.id),
            fullName: player.fullName ?? `Player ${player.id}`,
            position: getPositionName(entry.lineupSlotId ?? 0),
            proTeam: getProTeamAbbrev(player.proTeamId ?? 0),
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

async function fetchEspnLeagues(s2: string, swid: string, leagueId?: number): Promise<EspnLeagueData[]> {
  const year = new Date().getFullYear();
  const cookieHeader = `espn_s2=${s2}; SWID=${swid}`;

  if (leagueId) {
    const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${leagueId}?view=mTeam&view=mRoster&view=mSettings`;
    const resp = await fetch(url, {
      headers: { Cookie: cookieHeader, "Accept": "application/json" },
    });
    if (!resp.ok) {
      throw new Error(`ESPN API returned ${resp.status}: invalid tokens or league not found`);
    }
    const data = await resp.json() as EspnLeagueData;
    return [{ ...data, id: leagueId }];
  }

  const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${year}?view=proTeamSchedules_wl`;
  const resp = await fetch(url, {
    headers: {
      Cookie: cookieHeader,
      "Accept": "application/json",
      "x-fantasy-filter": JSON.stringify({ status: "ACTIVE" }),
    },
  });

  if (!resp.ok) {
    throw new Error(`ESPN API returned ${resp.status}: check your ESPN tokens`);
  }

  const data = await resp.json() as { leagues?: EspnLeagueData[] };

  if (data.leagues && Array.isArray(data.leagues)) {
    const results: EspnLeagueData[] = [];
    for (const l of data.leagues.slice(0, 5)) {
      if (!l.id) continue;
      try {
        const detailUrl = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${l.id}?view=mTeam&view=mRoster&view=mSettings`;
        const detailResp = await fetch(detailUrl, {
          headers: { Cookie: cookieHeader, "Accept": "application/json" },
        });
        if (detailResp.ok) {
          const detail = await detailResp.json() as EspnLeagueData;
          results.push({ ...detail, id: l.id });
        }
      } catch (e) {
        logger.warn({ leagueId: l.id, err: e }, "Failed to fetch league detail");
      }
    }
    return results;
  }

  throw new Error("No leagues found for these ESPN credentials");
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

function getPositionName(slotId: number): string {
  const positions: Record<number, string> = {
    0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K",
    20: "BENCH", 21: "IR", 23: "FLEX",
  };
  return positions[slotId] ?? "UNKNOWN";
}

function getProTeamAbbrev(teamId: number): string {
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
