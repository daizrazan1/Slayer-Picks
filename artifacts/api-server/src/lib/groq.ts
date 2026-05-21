import { createHash } from "crypto";
import { db } from "@workspace/db";
import { aiCacheTable } from "@workspace/db";
import { playersTable, teamsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

async function callGroq(prompt: string): Promise<string> {
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
          content: "You are an expert fantasy sports analyst. Analyze trades objectively and return valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 600,
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
