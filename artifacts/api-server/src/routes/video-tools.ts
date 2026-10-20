import { Router } from "express";
import rateLimit from "express-rate-limit";
import { GetVideoCapabilitiesResponse, RenderVideoBody, RenderVideoResponse, TranscribeVideoBody, TranscribeVideoResponse } from "@workspace/api-zod";
import { provision, assert } from "../lib/social";
import { renderClip, transcribeClip, videoCapabilities } from "../lib/video-processing";
import { authenticatedUserId } from "../lib/vastmind-auth";

const router = Router();
// Deliberately outside the social write transaction: processing must never hold
// the messenger's database lock while waiting for FFmpeg, storage, or speech AI.
router.use("/video-tools", async (req, res, next) => {
  const userId = await authenticatedUserId(req);
  assert(userId, 401, "Authentication required");
  res.locals.videoUser = (await provision(userId)).id;
  if (req.method === "POST" && req.headers.origin && !req.headers.authorization) {
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    let allowed = false;
    try { allowed = new URL(req.headers.origin).host === host; } catch { /* Invalid origins are rejected. */ }
    assert(allowed, 403, "Cross-origin request rejected");
  }
  next();
}, rateLimit({ windowMs: 60_000, limit: 30, keyGenerator: (_req, res) => res.locals.videoUser,
  standardHeaders: "draft-8", legacyHeaders: false }));

router.get("/video-tools/capabilities", async (_req, res) => {
  res.json(GetVideoCapabilitiesResponse.parse(await videoCapabilities()));
});
router.post("/video-tools/render", async (req, res) => {
  const body = RenderVideoBody.safeParse(req.body);
  assert(body.success, 400, "Invalid edit settings");
  res.json(RenderVideoResponse.parse(await renderClip(res.locals.videoUser, body.data)));
});
router.post("/video-tools/captions", async (req, res) => {
  const body = TranscribeVideoBody.safeParse(req.body);
  assert(body.success, 400, "Choose a video upload");
  res.json(TranscribeVideoResponse.parse(await transcribeClip(res.locals.videoUser, body.data.mediaId)));
});
export default router;
