import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";
import syncPushRouter from "./sync-push";
import leaguesRouter from "./leagues";
import playersRouter from "./players";
import tradeRouter from "./trade";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(syncRouter);
router.use(syncPushRouter);
router.use(leaguesRouter);
router.use(playersRouter);
router.use(tradeRouter);
router.use(dashboardRouter);

export default router;
