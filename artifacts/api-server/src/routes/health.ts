import { Router, type IRouter, type RequestHandler } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Keep readiness endpoints small and public so deployment probes do not enter
// authentication-gated application routes.
const healthCheck: RequestHandler = (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
};

router.get("/", healthCheck);
router.get("/healthz", healthCheck);

export default router;
