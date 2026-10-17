import { Router } from "express";
import { getAuth } from "@clerk/express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { RequestUploadUrlBody, RequestUploadUrlResponse, CompleteMediaUploadParams, CompleteMediaUploadResponse, GetMediaContentParams } from "@workspace/api-zod";
import { assert, query, provision, transaction, chatAllowed, blocked, canDiscover } from "../lib/social";
import { storage, mediaTypes, MEDIA_LIMIT, matchesMediaType, mediaShape } from "../lib/media";
import { issueMediaPlaybackTicket, verifyMediaPlaybackTicket } from "../lib/media-playback";
import { logger } from "../lib/logger";

const router = Router();
router.use("/storage", async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    const mediaMatch = req.method === "GET" && /^\/media\/([0-9a-f-]+)$/i.exec(req.path);
    const params = mediaMatch ? GetMediaContentParams.safeParse({ mediaId: mediaMatch[1] }) : null;
    const ticketViewer = params?.success
      ? verifyMediaPlaybackTicket(req.query.ticket, params.data.mediaId, process.env.SESSION_SECRET ?? "")
      : null;
    if (!ticketViewer) { res.status(401).json({ error: "Authentication required" }); return; }
    res.locals.mediaUser = (await provision(ticketViewer)).id;
    res.locals.mediaPlaybackTicket = true;
    next();
    return;
  }
  // Cookie-authenticated writes must originate on this application's host.
  if (req.method !== "GET" && req.headers.origin && !req.headers.authorization) {
    const host = String(req.headers["x-forwarded-host"] || req.headers.host).split(",")[0].trim();
    assert(new URL(req.headers.origin).host === host, 403, "Cross-origin request rejected");
  }
  res.locals.mediaUser = (await provision(userId)).id;
  next();
});
router.use("/storage", rateLimit({ windowMs: 60_000, limit: 100, keyGenerator: (_req,res) => res.locals.mediaUser, standardHeaders: "draft-8", legacyHeaders: false }));

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  assert(parsed.success, 400, "Invalid upload metadata");
  const body = parsed.data!;
  assert(["chat","status","post"].includes(body.purpose),400,"Unsupported upload purpose");
  assert(mediaTypes.has(body.contentType), 400, "Use JPEG, PNG, WebP, GIF, MP4, WebM, or a supported audio file");
  assert(body.purpose === "chat" || body.purpose === "post" || !body.contentType.startsWith("audio/"), 400, "Stories support photos and videos");
  const userId = res.locals.mediaUser;
  if (body.purpose === "chat") { assert(body.chatId, 400, "Conversation required"); await chatAllowed(body.chatId!, userId); }
  const [pending] = await query("SELECT count(*)::int AS n FROM media_uploads WHERE owner_id=$1 AND attached=false AND created_at>now()-interval '1 day'", [userId]);
  assert(pending.n < 30, 429, "Too many unfinished uploads. Try again later");
  const uploadUrl = await storage.getObjectEntityUploadURL();
  const id = randomUUID();
  await query(`INSERT INTO media_uploads (id,owner_id,object_path,name,content_type,size,purpose,chat_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id,userId,storage.normalizeObjectEntityPath(uploadUrl),body.name,body.contentType,body.size,body.purpose,body.purpose==="chat"?body.chatId:null]);
  res.json(RequestUploadUrlResponse.parse({id,uploadUrl}));
});

router.post("/storage/uploads/:mediaId/complete", async (req, res): Promise<void> => {
  const params = CompleteMediaUploadParams.safeParse(req.params); assert(params.success,400,"Invalid media ID");
  const id = params.data!.mediaId, userId = res.locals.mediaUser;
  await transaction(async q => {
    const [m] = await q("SELECT * FROM media_uploads WHERE id=$1 AND owner_id=$2 FOR UPDATE", [id,userId]); assert(m,404);
    if (m.ready) return;
    assert(new Date(m.created_at).getTime() > Date.now()-60*60_000,400,"Upload expired. Choose the file again");
    if (m.chat_id) await chatAllowed(m.chat_id,userId,q);
    const uploaded = await storage.getObjectEntityFile(m.object_path);
    const [metadata] = await uploaded.getMetadata();
    // Read/copy the exact generation we verified, not a concurrent overwrite.
    const file=uploaded.bucket.file(uploaded.name,{generation:metadata.generation});
    const size = Number(metadata.size);
    if (size !== Number(m.size) || size > MEDIA_LIMIT || metadata.contentType !== m.content_type) {
      await file.delete({ignoreNotFound:true});
      assert(false,400,"Uploaded file does not match its metadata");
    }
    const [head] = await file.download({start:0,end:63});
    if (!matchesMediaType(head,m.content_type)) {
      await file.delete({ignoreNotFound:true});
      assert(false,400,"File contents do not match the selected media type");
    }
    // Seal into an unsigned destination: a still-valid PUT URL cannot overwrite shared media.
    const finalPath = `/objects/sealed/${randomUUID()}`;
    const finalName = `${storage.getPrivateObjectDir().replace(/^\/[^/]+\//,"")}/${finalPath.slice("/objects/".length)}`;
    const sealed = file.bucket.file(finalName);
    await file.copy(sealed);
    await storage.trySetObjectEntityAclPolicy(finalPath,{owner:userId,visibility:"private"});
    await q("UPDATE media_uploads SET ready=true,object_path=$2 WHERE id=$1",[id,finalPath]);
    await file.delete({ignoreNotFound:true});
  });
  res.json(CompleteMediaUploadResponse.parse(await mediaShape(id)));
});

router.get("/storage/media/:mediaId", async (req,res): Promise<void> => {
  const parsed = GetMediaContentParams.safeParse(req.params); assert(parsed.success,400,"Invalid media ID");
  const [m] = await query("SELECT * FROM media_uploads WHERE id=$1 AND ready=true",[parsed.data!.mediaId]); assert(m,404);
  const viewer = res.locals.mediaUser;
  assert(!await blocked(viewer,m.owner_id),404);
  if (m.attached && m.purpose === "chat") await chatAllowed(m.chat_id,viewer);
  else if (m.attached && m.purpose === "status") {
    const [story] = await query("SELECT 1 FROM statuses WHERE media_id=$1 AND expires_at>now()",[m.id]); assert(story,404,"Story expired");
    const [owner] = await query("SELECT * FROM users WHERE id=$1",[m.owner_id]);
    assert(await canDiscover(viewer,owner),404);
  } else if (m.attached && m.purpose === "post") {
    const [item]=await query("SELECT author_id,community_id FROM posts WHERE media_id=$1 OR audio_media_id=$1 LIMIT 1",[m.id]);
    assert(item && item.author_id===m.owner_id,404,"Post media unavailable");
    if(item.community_id){
      const [communityAccess]=await query(`SELECT c.is_private,coalesce(cm.state,'none') AS state FROM communities c
        LEFT JOIN community_members cm ON cm.community_id=c.id AND cm.user_id=$2 WHERE c.id=$1`,[item.community_id,viewer]);
      assert(communityAccess&&(!communityAccess.is_private||communityAccess.state==="member"),404,"Post media unavailable");
    }
  } else assert(m.owner_id===viewer,403,"Media access denied");
  const file = await storage.getObjectEntityFile(m.object_path);
  // Video elements cannot attach Clerk's bearer header to each range request.
  // Issue an app-signed ticket instead of a GCS signed URL: Replit App Storage
  // credentials do not provide the IAM signing operation Google requires.
  if (req.query.playback === "1") {
    assert(!res.locals.mediaPlaybackTicket, 401, "Sign in to refresh media access");
    const { token, expiresAt } = issueMediaPlaybackTicket(
      m.id,
      viewer,
      process.env.SESSION_SECRET ?? "",
    );
    const url = `${req.baseUrl}${req.path}?ticket=${encodeURIComponent(token)}`;
    res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" })
      .json({ url, expiresAt });
    return;
  }
  const size = Number(m.size);
  res.set({"Content-Type":m.content_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Accept-Ranges":"bytes","Content-Disposition":"inline"});
  // Byte ranges allow mobile browsers to seek without downloading entire videos.
  let start=0, end=size-1;
  if (req.headers.range) {
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1]&&!match[2])) { res.status(416).set("Content-Range",`bytes */${size}`).end(); return; }
    start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
    end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;
    if (start>end || start>=size) { res.status(416).set("Content-Range",`bytes */${size}`).end(); return; }
    res.status(206).set("Content-Range",`bytes ${start}-${end}/${size}`);
  }
  res.set("Content-Length",String(end-start+1));
  const stream=file.createReadStream({start,end});
  stream.on("error",()=>{ if(!res.headersSent)res.status(502).end(); else res.destroy(); });
  res.on("close",()=>stream.destroy());
  stream.pipe(res);
});

// Lazy startup cleanup is also run hourly; expired stories are never served even before cleanup.
export async function cleanExpiredMedia() {
  const expired = await query(`SELECT m.* FROM media_uploads m WHERE
    (attached=false AND created_at<now()-interval '1 day')
    OR (purpose='status' AND attached=true AND NOT EXISTS(SELECT 1 FROM statuses s WHERE s.media_id=m.id AND s.expires_at>now())) LIMIT 100`);
  for (const m of expired) {
    try {
      const file=await storage.getObjectEntityFile(m.object_path);
      await file.delete({ignoreNotFound:true});
    } catch (err) { if ((err as Error).name!=="ObjectNotFoundError") { logger.warn("Media cleanup deferred"); continue; } }
    await query("DELETE FROM media_uploads WHERE id=$1",[m.id]);
  }
}
export default router;
