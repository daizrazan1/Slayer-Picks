import { createHash } from "crypto";
import { db } from "@workspace/db";
import { aiCacheTable } from "@workspace/db";
import { playersTable, teamsTable, leaguesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

async function callGroq(
  prompt: string,
  opts: { systemPrompt?: string; maxTokens?: number; temperature?: number } = {}
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
      model: MODEL,
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

  const formatPlayer = (p: typeof playersTable.$inferSelect) =>
    `${p.fullName} (${p.position}, ${p.proTeam}) - Avg: ${p.avgPoints ?? "N/A"} pts, Proj: ${p.projectedPoints ?? "N/A"} pts${p.injuryStatus ? `, Status: ${p.injuryStatus}` : ""}`;

  const prompt = `Evaluate this fantasy sports trade and return ONLY valid JSON.

Team A: "${teamA.name}" (${teamA.wins}-${teamA.losses}) gives up:
${givingUpA.map(formatPlayer).join("\n") || "Nothing"}

Team B: "${teamB.name}" (${teamB.wins}-${teamB.losses}) gives up:
${givingUpB.map(formatPlayer).join("\n") || "Nothing"}

Team A full roster: ${allTeamAPlayers.map(p => `${p.fullName} (${p.position})`).join(", ")}
Team B full roster: ${allTeamBPlayers.map(p => `${p.fullName} (${p.position})`).join(", ")}

Return ONLY this JSON (no markdown, no extra text):
{
  "winScoreA": <0-100, how much Team A wins from this trade>,
  "winScoreB": <0-100, how much Team B wins from this trade>,
  "analysis": "<2-3 sentence analysis of the trade value and impact>",
  "recommendation": "<Accept|Decline|Neutral>"
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
  const rawResponse = await callGroq(prompt);

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

  const formatPlayer = (p: typeof playersTable.$inferSelect) => {
    const meta = playerRankMap.get(p.id);
    const pts = p.totalPoints != null ? `${p.totalPoints.toFixed(0)} total pts` : "no pts data";
    const avg = meta ? `${meta.avgPerGame} pts/game avg` : "";
    const rank = meta ? `#${meta.rank}/${meta.total} ${normPos(p.position)} in league` : "";
    const tier = meta ? `[${meta.tier}]` : "";
    const inj = p.injuryStatus && !["ACTIVE", "NORMAL"].includes(p.injuryStatus)
      ? ` ⚠️${p.injuryStatus}` : "";
    return `  ${p.fullName} (${p.position}, ${p.proTeam}) — ${pts}, ${avg}, ${rank} ${tier}${inj}`;
  };

  // ── Fairness calibration math ────────────────────────────────────────────
  // Value ratio: at fairness F%, you get (100/F) × value for every 1 unit you give
  // e.g. 25% fairness → receive ~4x what you give; 50% → ~2x; 100% → ~1x
  const valueRatio = (100 / fairness).toFixed(2);
  const fairnessInstruction =
    fairness <= 20
      ? `HEAVILY LOPSIDED in my favor. For every 1 unit of value I give, I expect to receive at least 4x back. The other team is getting a bad deal — look for their undervalued players I can exploit.`
      : fairness <= 40
      ? `LOPSIDED in my favor. For every 1 unit of value I give, I expect to receive ~${valueRatio}x back. The package should clearly favor me.`
      : fairness <= 60
      ? `SLIGHT EDGE to me. For every 1 unit of value I give, I expect ~${valueRatio}x back. I should come out a bit ahead.`
      : fairness <= 80
      ? `MOSTLY BALANCED with a small edge to me. Value ratio ~${valueRatio}:1 in my favor. Near-equal but I should still win slightly.`
      : `PERFECTLY FAIR. Equal value both ways (~1:1 ratio). Suggest trades where both sides benefit equally.`;

  const teamRosters: Record<number, typeof playersTable.$inferSelect[]> = {};
  for (const t of opposingTeams) {
    teamRosters[t.id] = allLeaguePlayers.filter(p => p.teamId === t.id);
  }

  const posFilter = targetPositions && targetPositions.length > 0
    ? `TARGET POSITIONS: I specifically want to receive players at these positions: ${targetPositions.join(", ")}.`
    : "";
  const sizeFilter = packageSize ? `PACKAGE SIZE: Receive at most ${packageSize} player(s) in return.` : "";

  const offeredTotalPts = offeredPlayers.reduce((sum, p) => sum + (p.totalPoints ?? 0), 0);
  const offeredAvgPts = offeredPlayers.map(p => {
    const meta = playerRankMap.get(p.id);
    return meta ? parseFloat(meta.avgPerGame) : 0;
  }).reduce((a, b) => a + b, 0);

  const prompt = `You are an expert fantasy sports trade analyst. Your job is to find trade packages that match a specific fairness target.

SCORING CONTEXT: Season total points and per-game averages are calculated from actual ESPN fantasy scoring. Higher pts/game = more valuable player. Use the league ranking (#X/${allLeaguePlayers.length > 0 ? (byPos[Object.keys(byPos)[0] ?? ""] ?? []).length : "?"}) to assess relative value. Tiers: ELITE > STRONG > AVERAGE > WEAK.

MY TEAM: "${myTeam.name}" (${myTeam.wins}W-${myTeam.losses}L)
ESTIMATED GAMES PLAYED THIS SEASON: ~${estimatedGames}

PLAYERS I AM OFFERING (combined: ${offeredTotalPts.toFixed(0)} total pts, ${offeredAvgPts.toFixed(1)} pts/game):
${offeredPlayers.map(formatPlayer).join("\n") || "  (not specified)"}

FAIRNESS TARGET: ${fairness}% — ${fairnessInstruction}
Value ratio to apply: For every 1 point of value I give up, I should receive ~${valueRatio} points of value back.
${posFilter}
${sizeFilter}

MY FULL ROSTER:
${myRoster.map(formatPlayer).join("\n")}

OPPOSING TEAMS:
${opposingTeams.map(t => {
    const roster = (teamRosters[t.id] ?? []).filter(p => !benchSlots.has(p.position));
    const bench = (teamRosters[t.id] ?? []).filter(p => benchSlots.has(p.position));
    return `=== ${t.name} (${t.wins}W-${t.losses}L) [ID:${t.id}] ===\nStarters:\n${roster.map(formatPlayer).join("\n")}\nBench:\n${bench.map(formatPlayer).join("\n") || "  (none)"}`;
  }).join("\n\n")}

INSTRUCTIONS:
1. For each opposing team, find the ONE best trade package I can propose that achieves the ${fairness}% fairness target.
2. Use the pts/game averages and league rankings to calculate actual value — do NOT guess based on real-world reputation alone.
3. If fairness < 50%, the package MUST favor me. The players I receive should have higher pts/game than what I'm giving up (scaled by the value ratio ${valueRatio}:1).
4. If fairness > 80%, the packages should be roughly equal in pts/game value.
5. Consider roster needs — would the other team actually want my offered players?
6. Skip a team if no reasonable package exists (e.g., they have no players I'd want or our values don't align).

Return ONLY this JSON (no markdown, no extra text):
{
  "packages": [
    {
      "targetTeamId": <number>,
      "targetTeamName": "<string>",
      "record": "<W>-<L>",
      "playersToReceive": ["<name (pos) — X pts/game avg, #rank pos in league [TIER]>"],
      "fairnessScore": <estimated actual fairness 0-100 based on pts/game comparison>,
      "reasoning": "<2 sentences: cite the specific pts/game numbers for both sides and explain why this hits the ${fairness}% target>",
      "recommendation": "<Send It|Consider|Skip>"
    }
  ]
}`;

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
