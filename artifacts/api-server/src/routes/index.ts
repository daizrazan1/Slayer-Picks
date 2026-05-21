import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";
import syncPushRouter from "./sync-push";
import autoSyncRouter from "./auto-sync";
import leaguesRouter from "./leagues";
import playersRouter from "./players";
import tradeRouter from "./trade";
import dashboardRouter from "./dashboard";
import insightsRouter from "./insights";

const router: IRouter = Router();

router.use(healthRouter);
router.use(syncRouter);
router.use(syncPushRouter);
router.use(autoSyncRouter);
router.use(leaguesRouter);
router.use(playersRouter);
router.use(tradeRouter);
router.use(dashboardRouter);
router.use(insightsRouter);

export default router;
