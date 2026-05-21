import { Router, type IRouter } from "express";
import { EvaluateTradeBody, EvaluateTradeResponse, FindTradesBody, FindTradesResponse } from "@workspace/api-zod";
import { evaluateTrade, findTrades } from "../lib/groq";

const router: IRouter = Router();

router.post("/trade/evaluate", async (req, res): Promise<void> => {
  const parsed = EvaluateTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { teamAId, teamBId, teamAPlayers, teamBPlayers } = parsed.data;

  try {
    const result = await evaluateTrade(teamAId, teamBId, teamAPlayers, teamBPlayers);
    res.json(EvaluateTradeResponse.parse(result));
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    if (status === 429) {
      res.status(429).json({ error: "Groq rate limit exceeded. Please try again in a moment." });
      return;
    }
    req.log.error({ err }, "Trade evaluation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Trade evaluation failed" });
  }
});

router.post("/trade/find", async (req, res): Promise<void> => {
  const parsed = FindTradesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { leagueId, myTeamId, offeredPlayerIds, fairness, targetPositions, packageSize } = parsed.data;

  try {
    const result = await findTrades(
      leagueId,
      myTeamId,
      offeredPlayerIds,
      fairness,
      targetPositions ?? undefined,
      packageSize ?? undefined
    );
    res.json(FindTradesResponse.parse(result));
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    if (status === 429) {
      res.status(429).json({ error: "Groq rate limit exceeded. Please try again in a moment." });
      return;
    }
    req.log.error({ err }, "Trade Finder failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Trade Finder failed" });
  }
});

export default router;
