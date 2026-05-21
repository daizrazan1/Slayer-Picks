import { Router, type IRouter } from "express";
import { getTeamInsights } from "../lib/groq";

const router: IRouter = Router();

router.get("/teams/:teamId/insights", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params["teamId"] ?? "", 10);
  if (isNaN(teamId)) {
    res.status(400).json({ error: "Invalid teamId" });
    return;
  }

  try {
    const result = await getTeamInsights(teamId);
    res.json(result);
  } catch (err) {
    if (err instanceof Error && "status" in err && (err as NodeJS.ErrnoException & { status: number }).status === 429) {
      res.status(429).json({ error: "AI rate limit reached. Try again in a moment." });
      return;
    }
    if (err instanceof Error && err.message === "Team not found") {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    req.log.error({ err }, "Failed to generate team insights");
    res.status(500).json({ error: "Failed to generate insights" });
  }
});

export default router;
