import { Router, type IRouter } from "express";
import healthRouter from "./health";
import socialRouter from "./social";
import mediaRouter from "./media";
import videoToolsRouter from "./video-tools";
import commerceRouter from "./commerce";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mediaRouter);
router.use(videoToolsRouter);
router.use(commerceRouter);
router.use(socialRouter);

export default router;
