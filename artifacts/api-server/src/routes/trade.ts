import { Router, type IRouter } from "express";
import { EvaluateTradeBody, EvaluateTradeResponse } from "@workspace/api-zod";
import { evaluateTrade } from "../lib/groq";

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

export default router;
