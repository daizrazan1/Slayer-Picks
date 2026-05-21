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

// ── Team Insights ────────────────────────────────────────────────────────────

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
