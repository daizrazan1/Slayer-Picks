import { db } from "@workspace/db";
import { playersTable, teamsTable } from "@workspace/db";
import type { EspnPublicStats } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

export type { EspnPublicStats };

const SPORT_MAP: Record<string, { espnSport: string; espnLeague: string }> = {
  basketball: { espnSport: "basketball", espnLeague: "nba" },
  football:   { espnSport: "football",   espnLeague: "nfl" },
  baseball:   { espnSport: "baseball",   espnLeague: "mlb" },
  hockey:     { espnSport: "hockey",     espnLeague: "nhl" },
};

const PITCHER_POSITIONS = new Set(["SP", "RP", "P"]);

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeFetch(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractAllStats(data: Record<string, unknown>): Record<string, number> {
  const result: Record<string, number> = {};
  try {
    const splits = data["splits"] as Record<string, unknown> | undefined;
    const categories = splits?.["categories"] as
      | Array<{ stats?: Array<{ name: string; value: number }> }>
      | undefined;
    if (!categories) return result;
    for (const cat of categories) {
      for (const stat of cat.stats ?? []) {
        if (typeof stat.name === "string" && typeof stat.value === "number") {
          result[stat.name] = stat.value;
        }
      }
    }
  } catch { /* ignore */ }
  return result;
}

function pickKeys(obj: Record<string, number>, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of keys) {
    if (typeof obj[key] === "number") out[key] = obj[key]!;
  }
  return out;
}

export async function fetchEspnPublicStats(
  espnPlayerId: string,
  sport: string,
  position: string,
): Promise<EspnPublicStats | null> {
  const mapping = SPORT_MAP[sport];
  if (!mapping) return null;

  const { espnSport, espnLeague } = mapping;
  const base = `https://sports.core.api.espn.com/v2/sports/${espnSport}/leagues/${espnLeague}/athletes/${espnPlayerId}`;
  const newsBase = `https://site.api.espn.com/apis/site/v2/sports/${espnSport}/${espnLeague}/athletes/${espnPlayerId}`;

  const [statsData, newsData, profileData] = await Promise.all([
    safeFetch(`${base}/statistics`),
    safeFetch(`${newsBase}/news`),
    safeFetch(base),
  ]);

  const allStats = statsData ? extractAllStats(statsData) : {};
  const gamesPlayed = allStats["gamesPlayed"] ?? allStats["gamesStarted"] ?? 0;

  let statLine: Record<string, number> = {};
  const normPos = position.split("/")[0]?.trim().toUpperCase() ?? "";

  if (sport === "basketball") {
    statLine = pickKeys(allStats, ["avgPoints", "avgRebounds", "avgAssists", "avgBlocks", "avgSteals", "fieldGoalPct"]);
  } else if (sport === "football") {
    if (normPos === "QB") {
      statLine = pickKeys(allStats, ["passingYards", "passingTouchdowns", "completionPct"]);
    } else if (normPos === "RB") {
      statLine = pickKeys(allStats, ["rushingYards", "rushingTouchdowns", "avgRushingYards"]);
    } else if (["WR", "TE"].includes(normPos)) {
      statLine = pickKeys(allStats, ["receivingYards", "receivingTouchdowns", "avgReceivingYards", "receptions"]);
    } else if (normPos === "K") {
      statLine = pickKeys(allStats, ["fieldGoalPct", "extraPointsMade"]);
    }
  } else if (sport === "baseball") {
    if (PITCHER_POSITIONS.has(position)) {
      statLine = pickKeys(allStats, ["ERA", "WHIP", "strikeoutsPerNineInnings", "wins", "gamesStarted"]);
    } else {
      statLine = pickKeys(allStats, ["battingAverage", "homeRuns", "RBI", "onBasePct"]);
    }
  } else if (sport === "hockey") {
    statLine = pickKeys(allStats, ["goals", "assists", "points", "plusMinus"]);
  }

  let injuryDescription: string | undefined;
  if (profileData) {
    try {
      const injuries = profileData["injuries"] as
        | Array<{ details?: { fantasyStatus?: { description?: string }; detail?: string } }>
        | undefined;
      if (injuries && injuries.length > 0) {
        const inj = injuries[0];
        injuryDescription =
          inj?.details?.fantasyStatus?.description ?? inj?.details?.detail ?? undefined;
      }
      if (!injuryDescription) {
        const status = profileData["status"] as { type?: { description?: string } } | undefined;
        const desc = status?.type?.description;
        if (desc && desc.toLowerCase() !== "active") injuryDescription = desc;
      }
    } catch { /* ignore */ }
  }

  let recentHeadline: string | undefined;
  if (newsData) {
    try {
      const articles = newsData["articles"] as Array<{ headline?: string }> | undefined;
      const h = articles?.[0]?.headline;
      if (h) recentHeadline = h.slice(0, 80);
    } catch { /* ignore */ }
  }

  if (gamesPlayed === 0 && Object.keys(statLine).length === 0) return null;

  return { gamesPlayed, statLine, injuryDescription, recentHeadline, fetchedAt: new Date().toISOString() };
}

export function formatStatLine(stats: EspnPublicStats, sport: string, position: string): string {
  const s = stats.statLine;
  const gp = stats.gamesPlayed;
  const normPos = position.split("/")[0]?.trim().toUpperCase() ?? "";

  if (sport === "basketball") {
    const pts = s["avgPoints"]?.toFixed(1);
    const reb = s["avgRebounds"]?.toFixed(1);
    const ast = s["avgAssists"]?.toFixed(1);
    const blk = s["avgBlocks"]?.toFixed(1);
    const stl = s["avgSteals"]?.toFixed(1);
    const fg  = s["fieldGoalPct"]?.toFixed(1);
    const parts: string[] = [];
    if (pts) parts.push(`${pts} pts`);
    if (reb) parts.push(`${reb} reb`);
    if (ast) parts.push(`${ast} ast`);
    if (blk) parts.push(`${blk} blk`);
    if (stl) parts.push(`${stl} stl`);
    const trail = [`GP: ${gp}`, fg ? `FG: ${fg}%` : ""].filter(Boolean).join(", ");
    return `${parts.join(" / ")} (${trail})`;
  }

  if (sport === "football") {
    if (normPos === "QB") {
      const yds = s["passingYards"]?.toFixed(0);
      const tds = s["passingTouchdowns"]?.toFixed(0);
      const cmp = s["completionPct"]?.toFixed(1);
      return [yds && `${yds} PAS YDS`, tds && `${tds} TDs`, cmp && `${cmp}% comp`, `GP: ${gp}`].filter(Boolean).join(", ");
    }
    if (normPos === "RB") {
      const yds = s["rushingYards"]?.toFixed(0);
      const tds = s["rushingTouchdowns"]?.toFixed(0);
      const avg = s["avgRushingYards"]?.toFixed(1);
      return [yds && `${yds} RUS YDS`, tds && `${tds} TDs`, avg && `${avg} YPC`, `GP: ${gp}`].filter(Boolean).join(", ");
    }
    if (["WR", "TE"].includes(normPos)) {
      const yds = s["receivingYards"]?.toFixed(0);
      const tds = s["receivingTouchdowns"]?.toFixed(0);
      const rec = s["receptions"]?.toFixed(0);
      return [rec && `${rec} REC`, yds && `${yds} YDS`, tds && `${tds} TDs`, `GP: ${gp}`].filter(Boolean).join(", ");
    }
    if (normPos === "K") {
      const fg = s["fieldGoalPct"]?.toFixed(1);
      const xp = s["extraPointsMade"]?.toFixed(0);
      return [fg && `${fg}% FG`, xp && `${xp} XP`, `GP: ${gp}`].filter(Boolean).join(", ");
    }
  }

  if (sport === "baseball") {
    if (PITCHER_POSITIONS.has(position)) {
      const era  = s["ERA"]?.toFixed(2);
      const whip = s["WHIP"]?.toFixed(2);
      const k9   = s["strikeoutsPerNineInnings"]?.toFixed(1);
      const w    = s["wins"]?.toFixed(0);
      return [era && `${era} ERA`, whip && `${whip} WHIP`, k9 && `${k9} K/9`, w && `${w} W`, `GS: ${gp}`].filter(Boolean).join(", ");
    }
    const avg = s["battingAverage"] != null ? `.${Math.round(s["battingAverage"]! * 1000).toString().padStart(3, "0")}` : undefined;
    const hr  = s["homeRuns"]?.toFixed(0);
    const rbi = s["RBI"]?.toFixed(0);
    const obp = s["onBasePct"]?.toFixed(3);
    return [avg && `${avg} AVG`, hr && `${hr} HR`, rbi && `${rbi} RBI`, obp && `OBP: ${obp}`, `GP: ${gp}`].filter(Boolean).join(", ");
  }

  if (sport === "hockey") {
    const g   = s["goals"]?.toFixed(0);
    const a   = s["assists"]?.toFixed(0);
    const pts = s["points"]?.toFixed(0);
    const pm  = s["plusMinus"]?.toFixed(0);
    return [g && `${g} G`, a && `${a} A`, pts && `${pts} PTS`, pm && `${pm >= "0" ? "+" : ""}${pm} +/-`, `GP: ${gp}`].filter(Boolean).join(", ");
  }

  return `GP: ${gp}`;
}

export async function enrichLeaguePlayers(leagueId: number, sport: string): Promise<void> {
  const teams = await db.select({ id: teamsTable.id }).from(teamsTable).where(eq(teamsTable.leagueId, leagueId));
  if (teams.length === 0) return;

  const teamIds = teams.map(t => t.id);
  const players = await db
    .select({ id: playersTable.id, espnPlayerId: playersTable.espnPlayerId, position: playersTable.position })
    .from(playersTable)
    .where(inArray(playersTable.teamId, teamIds));

  logger.info({ leagueId, sport, playerCount: players.length }, "ESPN enrichment started");

  let enriched = 0;
  for (const player of players) {
    try {
      const stats = await fetchEspnPublicStats(player.espnPlayerId, sport, player.position);
      if (stats) {
        await db.update(playersTable).set({ espnPublicStats: stats }).where(eq(playersTable.id, player.id));
        enriched++;
      }
    } catch (err) {
      logger.warn({ playerId: player.id, err }, "Enrichment failed for player");
    }
    await delay(500);
  }

  logger.info({ leagueId, sport, enriched, total: players.length }, "ESPN enrichment complete");
}
