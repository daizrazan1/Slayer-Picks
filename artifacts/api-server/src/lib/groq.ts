import { createHash } from "crypto";
import { db } from "@workspace/db";
import { aiCacheTable } from "@workspace/db";
import { playersTable, teamsTable, leaguesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { formatStatLine } from "./espn-public";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL_FAST = "llama-3.1-8b-instant";
const MODEL_SMART = "llama-3.3-70b-versatile";

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

async function callGroq(
  prompt: string,
  opts: { systemPrompt?: string; maxTokens?: number; temperature?: number; model?: string } = {}
): Promise<string> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? MODEL_FAST,
      messages: [
        {
          role: "system",
          content: opts.systemPrompt ?? "You are an expert fantasy sports analyst. Analyze trades objectively and return valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 600,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw Object.assign(new Error("Groq rate limit exceeded"), { status: 429 });
    }
    throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "";
}

export interface TradeEvaluation {
  winScoreA: number;
  winScoreB: number;
  analysis: string;
  recommendation: string;
  teamAName: string;
  teamBName: string;
  cached: boolean;
  id: number | null;
  evaluatedAt: string | null;
}

export async function evaluateTrade(
  teamAId: number,
  teamBId: number,
  teamAPlayerIds: number[],
  teamBPlayerIds: number[]
): Promise<TradeEvaluation> {
  const [teamA] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamAId));
  const [teamB] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamBId));

  if (!teamA || !teamB) {
    throw new Error("One or both teams not found");
  }

  const allTeamAPlayers = await db.select().from(playersTable).where(eq(playersTable.teamId, teamAId));
  const allTeamBPlayers = await db.select().from(playersTable).where(eq(playersTable.teamId, teamBId));

  const givingUpA = teamAPlayerIds.length > 0
    ? await db.select().from(playersTable).where(inArray(playersTable.id, teamAPlayerIds))
    : [];
  const givingUpB = teamBPlayerIds.length > 0
    ? await db.select().from(playersTable).where(inArray(playersTable.id, teamBPlayerIds))
    : [];

  // Compute per-game averages as fallback when ESPN public stats aren't available yet
  const allRosterPlayers = [...allTeamAPlayers, ...allTeamBPlayers];
  const leagueMaxPts = Math.max(...allRosterPlayers.map(p => p.totalPoints ?? 0), 1);
  const estimatedGames = Math.max(1, Math.round(leagueMaxPts / 68));

  const [league] = teamA.leagueId
    ? await db.select({ sport: leaguesTable.sport }).from(leaguesTable).where(eq(leaguesTable.id, teamA.leagueId))
    : [{ sport: "basketball" }];
  const sport = league?.sport ?? "basketball";

  const ppg = (p: typeof playersTable.$inferSelect) =>
    p.totalPoints != null ? (p.totalPoints / estimatedGames).toFixed(1) : null;

  const formatPlayer = (p: typeof playersTable.$inferSelect) => {
    let statsStr: string;
    if (p.espnPublicStats && p.espnPublicStats.gamesPlayed > 0) {
      statsStr = formatStatLine(p.espnPublicStats, sport, p.position);
      if (p.espnPublicStats.recentHeadline) {
        statsStr += ` | News: ${p.espnPublicStats.recentHeadline}`;
      }
    } else {
      const avg = ppg(p);
      statsStr = avg ? `~${avg} ppg est (${p.totalPoints?.toFixed(0)} season pts)` : "no pts data";
    }
    const inj = p.injuryStatus && !["ACTIVE", "NORMAL"].includes(p.injuryStatus) ? ` [${p.injuryStatus}]` : "";
    if (p.espnPublicStats?.injuryDescription) {
      return `  • ${p.fullName} (${p.position}, ${p.proTeam}) — ${statsStr}${inj} [Injury: ${p.espnPublicStats.injuryDescription}]`;
    }
    return `  • ${p.fullName} (${p.position}, ${p.proTeam}) — ${statsStr}${inj}`;
  };

  const combinedPpg = (players: typeof givingUpA) =>
    players.reduce((sum, p) => sum + (p.totalPoints != null ? p.totalPoints / estimatedGames : 0), 0).toFixed(1);

  // Roster context for team needs — names only, do NOT discuss in analysis
  const rosterContext = (players: typeof allTeamAPlayers, tradingIds: number[]) =>
    players.filter(p => !tradingIds.includes(p.id)).map(p => `${p.fullName}(${p.position})`).join(", ") || "none";

  const prompt = `You are an expert fantasy basketball analyst. Evaluate ONLY the traded players listed below. Do NOT mention any player not explicitly listed under "GIVES UP".

TRADE (estimated games played this season: ~${estimatedGames}):
Team A "${teamA.name}" (${teamA.wins}W-${teamA.losses}L) GIVES UP — combined ${combinedPpg(givingUpA)} ppg:
${givingUpA.map(formatPlayer).join("\n") || "  (none)"}

Team B "${teamB.name}" (${teamB.wins}W-${teamB.losses}L) GIVES UP — combined ${combinedPpg(givingUpB)} ppg:
${givingUpB.map(formatPlayer).join("\n") || "  (none)"}

Roster context after trade (for positional needs only — do NOT mention these players in analysis):
Team A keeps: ${rosterContext(allTeamAPlayers, teamAPlayerIds)}
Team B keeps: ${rosterContext(allTeamBPlayers, teamBPlayerIds)}

EVALUATION RULES:
1. Use ppg as the primary value metric. A player averaging 65+ ppg is ELITE and carries outsized win-now value that combined lesser players often cannot match.
2. Combined ppg alone does not equal value — one 74 ppg player is worth more than two 37 ppg players because elite players are scarce and ceiling-defining.
3. Consider positional fit: does each team actually need what they're receiving?
4. Account for trade timing: during the season, immediate production matters most. In the off-season, hold elite players unless receiving multiple strong players (55+ ppg each).
5. Injury flags are significant — adjust value down for injured/questionable players.
6. winScoreA/winScoreB must reflect actual lopsidedness. If Team A gives up a 74 ppg player for two 50 ppg players, Team A's win score should be LOW (25-35) and Team B's HIGH (70-80) — do not default to 50/50.

Return ONLY this JSON (no markdown, no extra text):
{
  "winScoreA": <0-100>,
  "winScoreB": <0-100>,
  "analysis": "<3-4 sentences: name each traded player with their ppg, compare the sides, explain who wins and why, note off-season vs in-season implications>",
  "recommendation": "<Accept|Decline|Neutral> (from Team A's perspective)"
}`;

  const promptHash = hashPrompt(prompt);

  const [cached] = await db.select().from(aiCacheTable).where(eq(aiCacheTable.promptHash, promptHash));
  if (cached) {
    logger.info({ promptHash }, "AI cache hit");
    return {
      winScoreA: cached.winScoreA ?? 50,
      winScoreB: cached.winScoreB ?? 50,
      analysis: JSON.parse(cached.response).analysis ?? cached.response,
      recommendation: cached.recommendation ?? "Neutral",
      teamAName: teamA.name,
      teamBName: teamB.name,
      cached: true,
      id: cached.id,
      evaluatedAt: cached.createdAt.toISOString(),
    };
  }

  logger.info({ promptHash }, "Calling Groq AI for trade evaluation");
  const rawResponse = await callGroq(prompt, { model: MODEL_SMART, maxTokens: 800, temperature: 0.3 });

  let parsed: { winScoreA: number; winScoreB: number; analysis: string; recommendation: string };
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    parsed = { winScoreA: 50, winScoreB: 50, analysis: rawResponse, recommendation: "Neutral" };
  }

  const [inserted] = await db.insert(aiCacheTable).values({
    promptHash,
    prompt,
    response: JSON.stringify(parsed),
    teamAId,
    teamBId,
    teamAName: teamA.name,
    teamBName: teamB.name,
    winScoreA: parsed.winScoreA,
    winScoreB: parsed.winScoreB,
    recommendation: parsed.recommendation,
  }).returning();

  return {
    winScoreA: parsed.winScoreA,
    winScoreB: parsed.winScoreB,
    analysis: parsed.analysis,
    recommendation: parsed.recommendation,
    teamAName: teamA.name,
    teamBName: teamB.name,
    cached: false,
    id: inserted?.id ?? null,
    evaluatedAt: inserted?.createdAt.toISOString() ?? new Date().toISOString(),
  };
}

// ── Trade Finder ─────────────────────────────────────────────────────────────

export interface TradePackage {
  targetTeamId: number;
  targetTeamName: string;
  record: string;
  playersToReceive: string[];
  fairnessScore: number;
  reasoning: string;
  recommendation: string;
}

export interface TradeFindResult {
  myTeamName: string;
  packages: TradePackage[];
  cached: boolean;
}

export async function findTrades(
  leagueId: number,
  myTeamId: number,
  offeredPlayerIds: number[],
  fairness: number,
  targetPositions?: string[],
  packageSize?: number
): Promise<TradeFindResult> {
  const [myTeam] = await db.select().from(teamsTable).where(eq(teamsTable.id, myTeamId));
  if (!myTeam) throw new Error("Your team not found");

  const allTeams = await db.select().from(teamsTable).where(eq(teamsTable.leagueId, leagueId));
  const opposingTeams = allTeams.filter(t => t.id !== myTeamId);

  // Fetch ALL players in the league for value ranking context
  const allTeamIds = allTeams.map(t => t.id);
  const allLeaguePlayers = allTeamIds.length > 0
    ? await db.select().from(playersTable).where(inArray(playersTable.teamId, allTeamIds))
    : [];

  const myRoster = allLeaguePlayers.filter(p => p.teamId === myTeamId);
  const offeredPlayers = offeredPlayerIds.length > 0
    ? myRoster.filter(p => offeredPlayerIds.includes(p.id))
    : [];

  // ── Build position value rankings ────────────────────────────────────────
  // Group starters by base position, rank by totalPoints
  const benchSlots = new Set(["BENCH", "IR", "FLEX", "UTIL"]);
  const starters = allLeaguePlayers.filter(p => !benchSlots.has(p.position) && p.totalPoints != null);

  // Normalize position names for grouping (SG/SF → SG, SF etc.)
  const normPos = (pos: string) => pos.split("/")[0]!.trim();
  const byPos: Record<string, typeof playersTable.$inferSelect[]> = {};
  for (const p of starters) {
    const key = normPos(p.position);
    byPos[key] = byPos[key] ?? [];
    byPos[key]!.push(p);
  }
  // Sort each group descending by totalPoints
  for (const key of Object.keys(byPos)) {
    byPos[key]!.sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0));
  }

  // Build player rank + value tier lookup map
  const playerRankMap = new Map<number, { rank: number; total: number; avgPerGame: string; tier: string }>();

  // Estimate games played from the max total in the league (dynamic per sport)
  const leagueMaxPts = Math.max(...starters.map(p => p.totalPoints ?? 0), 1);
  // Estimate: top player averages ~65-70 pts/game (typical for ESPN standard scoring in pts leagues)
  const estimatedGames = Math.max(1, Math.round(leagueMaxPts / 68));

  for (const [, group] of Object.entries(byPos)) {
    const total = group.length;
    group.forEach((p, idx) => {
      const rank = idx + 1;
      const pctile = 1 - rank / total;
      const tier = pctile >= 0.80 ? "ELITE" : pctile >= 0.55 ? "STRONG" : pctile >= 0.30 ? "AVERAGE" : "WEAK";
      const avgPerGame = p.totalPoints != null
        ? (p.totalPoints / estimatedGames).toFixed(1)
        : "N/A";
      playerRankMap.set(p.id, { rank, total, avgPerGame, tier });
    });
  }

  const leagueRow = allLeaguePlayers.length > 0
    ? await db.select({ sport: leaguesTable.sport }).from(leaguesTable).where(eq(leaguesTable.id, leagueId)).then(r => r[0])
    : null;
  const sport = leagueRow?.sport ?? "basketball";

  // Ultra-compact format: keep lines short to stay within Groq payload limit
  // Tier abbreviations: E=ELITE S=STRONG A=AVERAGE W=WEAK
  const tierAbbr = (t: string) => t[0] ?? "?";
  const formatPlayer = (p: typeof playersTable.$inferSelect) => {
    const meta = playerRankMap.get(p.id);
    const avg = meta ? `${meta.avgPerGame}ppg` : (p.totalPoints != null ? `${p.totalPoints.toFixed(0)}tot` : "?");
    const rank = meta ? `#${meta.rank}${normPos(p.position)}[${tierAbbr(meta.tier)}]` : "";
    const inj = p.injuryStatus && !["ACTIVE", "NORMAL"].includes(p.injuryStatus) ? `!${p.injuryStatus}` : "";
    const realStats = p.espnPublicStats && p.espnPublicStats.gamesPlayed > 0
      ? ` [${formatStatLine(p.espnPublicStats, sport, p.position)}]`
      : "";
    return `${p.fullName}(${p.position}) ${avg} ${rank}${inj}${realStats}`;
  };

  const valueRatio = (100 / fairness).toFixed(1);
  const fairnessInstr =
    fairness <= 30 ? `heavily favors me — receive ~${valueRatio}x value back` :
    fairness <= 55 ? `favors me — receive ~${valueRatio}x value back` :
    fairness <= 75 ? `slight edge to me — receive ~${valueRatio}x value back` :
    `fair/equal — receive ~1:1 value`;

  const teamRosters: Record<number, typeof playersTable.$inferSelect[]> = {};
  for (const t of opposingTeams) {
    teamRosters[t.id] = allLeaguePlayers.filter(p => p.teamId === t.id);
  }

  const posFilter = targetPositions && targetPositions.length > 0
    ? `Want back: ${targetPositions.join(",")}` : "";
  const sizeFilter = packageSize ? `Max receive: ${packageSize}` : "";

  const offeredAvgPts = offeredPlayers.map(p => {
    const meta = playerRankMap.get(p.id);
    return meta ? parseFloat(meta.avgPerGame) : 0;
  }).reduce((a, b) => a + b, 0);

  // Only include starters for opposing teams, capped at 12 per team to limit payload
  const oppTeamLines = opposingTeams.map(t => {
    const starters = (teamRosters[t.id] ?? [])
      .filter(p => !benchSlots.has(p.position))
      .sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
      .slice(0, 12);
    return `[${t.id}]${t.name}(${t.wins}-${t.losses}):\n${starters.map(formatPlayer).join("\n")}`;
  }).join("\n\n");

  const prompt = `Fantasy trade finder. Tiers:E>S>A>W. ppg=pts/game avg(~${estimatedGames} games). Value ratio at ${fairness}% fairness: ${fairnessInstr}.
${posFilter} ${sizeFilter}

OFFERING(${offeredAvgPts.toFixed(1)}ppg combined):
${offeredPlayers.map(formatPlayer).join("\n") || "(none)"}

MY ROSTER:
${myRoster.filter(p => !benchSlots.has(p.position)).map(formatPlayer).join("\n")}

OPPOSING TEAMS(starters only):
${oppTeamLines}

RULES:
- The OFFERING listed above is FIXED. I am sending EXACTLY those players and NO others. Do NOT add, swap, or mention any other players on my side.
- Your ONLY job is to decide which players I should RECEIVE from each opposing team.
- For each team, find the best package for me to receive at ${fairness}% fairness(${fairnessInstr}).
- Use ppg to judge value. Skip teams with no viable package.
Return ONLY JSON:
{"packages":[{"targetTeamId":<n>,"targetTeamName":"<s>","record":"<W-L>","playersToReceive":["<name ppg tier>"],"fairnessScore":<0-100>,"reasoning":"<2 sentences citing ppg numbers for both sides>","recommendation":"<Send It|Consider|Skip>"}]}`;

  const promptHash = hashPrompt(prompt);
  const [cached] = await db.select().from(aiCacheTable).where(eq(aiCacheTable.promptHash, promptHash));
  if (cached) {
    logger.info({ promptHash }, "Trade Finder: cache hit");
    const cachedData = JSON.parse(cached.response) as { packages: TradePackage[] };
    return { myTeamName: myTeam.name, packages: cachedData.packages ?? [], cached: true };
  }

  logger.info({ myTeamId, leagueId, fairness, offeredCount: offeredPlayers.length }, "Calling Groq AI for Trade Finder");
  const rawResponse = await callGroq(prompt, {
    systemPrompt: "You are an expert fantasy sports trade analyst. Analyze rosters and return valid JSON only.",
    maxTokens: 2000,
    temperature: 0.3,
  });

  let parsed: { packages: TradePackage[] };
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    // Try extracting JSON from the response if it has extra text
    const match = rawResponse.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : { packages: [] };
    } catch {
      parsed = { packages: [] };
    }
  }

  // Sort: Send It first, then Consider, then Skip, within each group by fairnessScore closest to target
  const order = { "Send It": 0, "Consider": 1, "Skip": 2 };
  parsed.packages.sort((a, b) => {
    const oa = order[a.recommendation as keyof typeof order] ?? 2;
    const ob = order[b.recommendation as keyof typeof order] ?? 2;
    if (oa !== ob) return oa - ob;
    return Math.abs(a.fairnessScore - fairness) - Math.abs(b.fairnessScore - fairness);
  });

  await db.insert(aiCacheTable).values({
    promptHash,
    prompt,
    response: JSON.stringify(parsed),
    teamAId: myTeamId,
    teamBId: myTeamId,
    teamAName: myTeam.name,
    teamBName: "Trade Finder",
    winScoreA: fairness,
    winScoreB: 100 - fairness,
    recommendation: "Trade Finder",
  });

  return { myTeamName: myTeam.name, packages: parsed.packages ?? [], cached: false };
}

// ── Team Insights ─────────────────────────────────────────────────────────────

export interface InsightTip {
  type: string;
  priority: string;
  player?: string | null;
  message: string;
}

export interface TeamInsights {
  teamId: number;
  teamName: string;
  insights: string;
  tips: InsightTip[];
  standingsRank: number | null;
  totalTeams: number | null;
  cached: boolean;
}

const insightsCache = new Map<string, { result: TeamInsights; expiresAt: number }>();
const INSIGHTS_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function getTeamInsights(teamId: number): Promise<TeamInsights> {
  const cacheKey = String(teamId);
  const now = Date.now();
  const hit = insightsCache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return { ...hit.result, cached: true };
  }

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) throw new Error("Team not found");

  const [leagueRow] = await db.select().from(leaguesTable).where(eq(leaguesTable.id, team.leagueId));
  const allTeams = await db.select().from(teamsTable).where(eq(teamsTable.leagueId, team.leagueId));
  const roster = await db.select().from(playersTable).where(eq(playersTable.teamId, teamId));

  const sorted = [...allTeams].sort(
    (a, b) => b.wins - a.wins || (b.pointsFor ?? 0) - (a.pointsFor ?? 0)
  );
  const rank = sorted.findIndex(t => t.id === teamId) + 1;

  const sport = leagueRow?.sport ?? "fantasy";
  const starters = roster.filter(p => !["BENCH", "IR"].includes(p.position));
  const bench = roster.filter(p => ["BENCH", "IR"].includes(p.position));

  const formatPlayer = (p: typeof playersTable.$inferSelect) => {
    const pts = p.totalPoints != null ? ` Pts: ${p.totalPoints.toFixed(1)}` : "";
    const inj = p.injuryStatus && !["ACTIVE", "NORMAL"].includes(p.injuryStatus) ? ` [${p.injuryStatus}]` : "";
    return `${p.fullName} (${p.position}, ${p.proTeam})${pts}${inj}`;
  };

  const prompt = `Analyze this ${sport} fantasy team and give specific, actionable advice for next season or trades.

LEAGUE: ${leagueRow?.name ?? "Unknown"} — ${sport.toUpperCase()}, ${leagueRow?.season ?? ""} season
TEAM: "${team.name}" — ${team.wins}W-${team.losses}L${team.ties ? `-${team.ties}T` : ""} | PF: ${team.pointsFor?.toFixed(1) ?? "N/A"} | PA: ${team.pointsAgainst?.toFixed(1) ?? "N/A"}
STANDINGS: #${rank} of ${allTeams.length}

STARTERS:
${starters.map(formatPlayer).join("\n")}

BENCH:
${bench.map(formatPlayer).join("\n") || "None"}

OTHER TEAMS (standings context):
${sorted.filter(t => t.id !== teamId).slice(0, 8).map((t, i) => `#${i + (i >= rank - 1 ? 2 : 1)} ${t.name}: ${t.wins}W-${t.losses}L, PF: ${t.pointsFor?.toFixed(1) ?? "N/A"}`).join("\n")}

Provide 4-5 specific, actionable tips. Reference real player names from the roster. For trade tips, name who to trade away and what positions to target. For waiver advice, name positions of need.

Return ONLY this JSON (no markdown, no extra text):
{
  "insights": "<2-3 sentence overall assessment covering record, roster strengths/weaknesses, and what this team needs>",
  "tips": [
    { "type": "<trade|waiver|lineup|general>", "priority": "<high|medium|low>", "player": "<player name or null>", "message": "<specific actionable advice referencing actual players>" }
  ]
}`;

  logger.info({ teamId, rank, totalTeams: allTeams.length }, "Calling Groq AI for team insights");
  const rawResponse = await callGroq(prompt, {
    systemPrompt: "You are an expert fantasy sports analyst. Give specific, actionable advice. Return valid JSON only.",
    maxTokens: 900,
    temperature: 0.4,
  });

  let parsed: { insights: string; tips: InsightTip[] };
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    parsed = { insights: rawResponse, tips: [] };
  }

  const result: TeamInsights = {
    teamId,
    teamName: team.name,
    insights: parsed.insights ?? "",
    tips: Array.isArray(parsed.tips) ? parsed.tips : [],
    standingsRank: rank,
    totalTeams: allTeams.length,
    cached: false,
  };

  insightsCache.set(cacheKey, { result, expiresAt: now + INSIGHTS_TTL_MS });
  return result;
}
