import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { verifyAccountRecoveryChallenge } from "@workspace/mail-crypto";
import { pool } from "@workspace/db";
import { clerkClient, getAuth } from "@clerk/express";
import {
  ListIdentitySessionsResponse,
  RevokeIdentitySessionParams,
  RevokeIdentitySessionResponse,
} from "@workspace/api-zod";
import { assert, HttpError, query, provision, uuid } from "../lib/social";
import {
  createRegistrationIntent,
  mobileSessionFromToken,
  requestHeaders,
  vastMindAuth,
} from "../lib/vastmind-auth";
import { isValidChosenUsername, normalizeUsername } from "../lib/usernames";

const router = Router();
router.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin && !req.headers.authorization) {
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    try {
      if (new URL(req.headers.origin).host !== host) throw new Error();
    } catch {
      res.status(403).json({ error: "Cross-origin request rejected" });
      return;
    }
  }
  next();
});
const usernameSchema = z.string().trim().transform(normalizeUsername).refine(isValidChosenUsername);
const recoveryPublicKeySchema = z.string().regex(/^[0-9a-f]{64}$/i);
const identityLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const mobileTicketIdentifier = (ticket: string) =>
  `mobile-session:${createHash("sha256").update(ticket).digest("hex")}`;
const mobileSessionDetailsSchema = z.object({
  userId: z.string().min(1),
  webSessionId: z.string().min(1),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  redirectUri: z.string().min(1).max(500),
  state: z.string().uuid(),
});
function allowedMobileRedirect(raw: string): boolean {
  try {
    const url = new URL(raw);
    const isGatherCallback = url.protocol === "gather:"
      && ((url.host === "auth" && url.pathname === "/callback")
        || (!url.host && url.pathname === "/auth/callback"));
    if (isGatherCallback) return true;
    if (process.env.NODE_ENV === "production" || url.protocol !== "exp:" || url.pathname !== "/--/auth/callback") {
      return false;
    }
    const configuredHosts = [process.env.REPLIT_EXPO_DEV_DOMAIN, process.env.REPLIT_DEV_DOMAIN]
      .map((host) => host?.replace(/^https?:\/\//, "").split("/")[0].toLowerCase())
      .filter((host): host is string => !!host);
    return configuredHosts.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Start a passwordless account or link a passkey to the currently signed-in
// Clerk account. The random context expires quickly and is consumed on success.
router.post("/identity/passkey-registration-intents", identityLimiter, async (req, res) => {
  const parsed = z.object({
    username: usernameSchema,
    displayName: z.string().trim().min(1).max(80),
    recoveryPublicKey: recoveryPublicKeySchema,
  }).safeParse(req.body);
  assert(parsed.success, 400, "Enter a valid VastMind ID and recovery key.");
  const username = parsed.data.username.toLowerCase();
  const legacyClerkUserId = getAuth(req).userId;
  const passkeySession = await vastMindAuth.api.getSession({ headers: requestHeaders(req) });
  if (passkeySession) {
    throw new HttpError(409, "You are already signed in with a VastMind passkey.");
  }

  const userId = legacyClerkUserId ?? uuid();
  const displayName = parsed.data.displayName;
  if (legacyClerkUserId) {
    await provision(legacyClerkUserId);
  }

  const [taken] = await query(
    "SELECT id FROM users WHERE lower(username)=lower($1) AND id<>$2",
    [username, userId],
  );
  assert(!taken, 409, "That VastMind ID is already in use.");
  const context = await createRegistrationIntent({
    userId,
    username,
    displayName,
    recoveryPublicKey: parsed.data.recoveryPublicKey.toLowerCase(),
  });
  res.status(201).json({ context, identifier: `${username}@vastmind.com`, expiresInSeconds: 600 });
});

// Issue a one-time challenge for user-held phrase recovery. Unknown IDs receive
// the same response shape so this endpoint does not act as an account directory.
router.post("/identity/recovery-challenges", identityLimiter, async (req, res) => {
  const parsed = z.object({ username: usernameSchema }).safeParse(req.body);
  assert(parsed.success, 400, "Enter a valid VastMind ID.");
  const username = parsed.data.username.toLowerCase();
  await query("DELETE FROM account_recovery_challenge WHERE expires_at < now() - interval '1 day'");
  const challengeId = randomUUID();
  const challenge = randomBytes(32).toString("base64url");
  const [user] = await query(
    "SELECT id FROM users WHERE lower(username)=lower($1)",
    [username],
  );
  if (user) {
    await query(
      `INSERT INTO account_recovery_challenge (id, user_id, challenge, expires_at)
       VALUES ($1,$2,$3,now() + interval '5 minutes')`,
      [challengeId, user.id, challenge],
    );
  }
  res.status(200).json({ challengeId, challenge });
});

// A valid signature proves possession of the user-held phrase-derived key.
// The phrase itself is never submitted to this server.
router.post("/identity/recovery-registration-intents", identityLimiter, async (req, res) => {
  const parsed = z.object({
    challengeId: z.string().uuid(),
    challenge: z.string().min(32).max(128),
    signature: z.string().regex(/^[0-9a-f]{128}$/i),
  }).safeParse(req.body);
  assert(parsed.success, 400, "Recovery proof is invalid or expired.");
  const client = await pool.connect();
  let recovered: { userId: string; username: string; displayName: string; publicKey: string } | undefined;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT c.id, c.user_id, c.challenge, c.expires_at, c.used_at, c.attempts,
              u.username, u.name, k.public_key
       FROM account_recovery_challenge c
       JOIN users u ON u.id=c.user_id
       JOIN account_recovery_key k ON k.user_id=c.user_id
       WHERE c.id=$1 FOR UPDATE`,
      [parsed.data.challengeId],
    );
    const challenge = rows[0];
    const validChallenge = !!challenge
      && !challenge.used_at
      && new Date(challenge.expires_at).getTime() > Date.now()
      && challenge.attempts < 5
      && challenge.challenge === parsed.data.challenge;
    const signatureValid = validChallenge && verifyAccountRecoveryChallenge(
      challenge.public_key,
      parsed.data.challenge,
      parsed.data.signature,
    );
    if (!signatureValid) {
      if (challenge && !challenge.used_at && challenge.attempts < 5) {
        await client.query(
          `UPDATE account_recovery_challenge SET attempts=attempts+1,
             used_at=CASE WHEN attempts >= 4 THEN now() ELSE used_at END
           WHERE id=$1`,
          [parsed.data.challengeId],
        );
      }
      await client.query("COMMIT");
      throw new HttpError(401, "Recovery proof is invalid or expired.");
    }
    recovered = {
      userId: challenge.user_id,
      username: challenge.username,
      displayName: challenge.name,
      publicKey: challenge.public_key,
    };
    await client.query(
      "UPDATE account_recovery_challenge SET used_at=now() WHERE id=$1",
      [parsed.data.challengeId],
    );
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* The transaction may already be committed. */ }
    throw error;
  } finally {
    client.release();
  }
  assert(recovered, 401, "Recovery proof is invalid or expired.");
  const context = await createRegistrationIntent({
    userId: recovered.userId,
    username: recovered.username,
    displayName: recovered.displayName,
    recoveryPublicKey: recovered.publicKey,
  });
  res.status(201).json({ context, identifier: `${recovered.username}@vastmind.com`, expiresInSeconds: 600 });
});

// Native devices complete the same web passkey/recovery flow. This bridge
// stores only a hashed, two-minute ticket and binds it to PKCE, state, session,
// and an allow-listed app callback. The ticket itself is single-use.
router.post("/identity/mobile-session-tickets", identityLimiter, async (req, res) => {
  const parsed = z.object({
    codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    redirectUri: z.string().min(1).max(500),
    state: z.string().uuid(),
  }).safeParse(req.body);
  assert(parsed.success, 400, "The mobile sign-in request is invalid.");
  assert(allowedMobileRedirect(parsed.data.redirectUri), 400, "The mobile app callback is not allowed.");
  const webSession = await vastMindAuth.api.getSession({ headers: requestHeaders(req) });
  assert(webSession?.user.id && webSession.session.id, 401, "Sign in with VastMind before returning to the mobile app.");

  const ticket = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 2 * 60_000);
  const details = {
    userId: webSession.user.id,
    webSessionId: webSession.session.id,
    codeChallenge: parsed.data.codeChallenge,
    redirectUri: parsed.data.redirectUri,
    state: parsed.data.state,
  };
  await pool.query(
    `INSERT INTO "verification" (id, identifier, value, expires_at)
     VALUES ($1,$2,$3,$4)`,
    [randomUUID(), mobileTicketIdentifier(ticket), JSON.stringify(details), expiresAt],
  );
  res.status(201).json({ ticket, expiresAt: expiresAt.toISOString() });
});

router.post("/identity/mobile-session-exchange", identityLimiter, async (req, res) => {
  const parsed = z.object({
    ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    verifier: z.string().min(43).max(128).regex(/^[A-Za-z0-9_-]+$/),
    redirectUri: z.string().min(1).max(500),
    state: z.string().uuid(),
  }).safeParse(req.body);
  assert(parsed.success, 400, "The mobile sign-in request is invalid.");
  assert(allowedMobileRedirect(parsed.data.redirectUri), 400, "The mobile app callback is not allowed.");

  const client = await pool.connect();
  const accessToken = randomBytes(32).toString("base64url");
  const mobileSessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  try {
    await client.query("BEGIN");
    const { rows: [ticketRow] } = await client.query<{ value: string }>(
      `SELECT value FROM "verification"
       WHERE identifier=$1 AND expires_at > now()
       FOR UPDATE`,
      [mobileTicketIdentifier(parsed.data.ticket)],
    );
    assert(ticketRow, 401, "The mobile sign-in ticket expired or was already used.");

    let details: z.infer<typeof mobileSessionDetailsSchema> | null = null;
    try {
      const decoded = JSON.parse(ticketRow.value);
      const checked = mobileSessionDetailsSchema.safeParse(decoded);
      if (checked.success) details = checked.data;
    } catch {
      details = null;
    }
    assert(details, 401, "The mobile sign-in ticket is invalid.");
    const submittedChallenge = createHash("sha256").update(parsed.data.verifier).digest("base64url");
    assert(
      details.redirectUri === parsed.data.redirectUri
        && details.state === parsed.data.state
        && constantTimeEqual(details.codeChallenge, submittedChallenge),
      401,
      "The mobile sign-in ticket could not be verified.",
    );
    const { rows: [webSession] } = await client.query<{ user_id: string }>(
      `SELECT user_id FROM "session"
       WHERE id=$1 AND user_id=$2 AND expires_at > now()
       FOR SHARE`,
      [details.webSessionId, details.userId],
    );
    assert(webSession, 401, "The web sign-in session expired. Please sign in again.");

    await client.query(
      `DELETE FROM "verification" WHERE identifier=$1`,
      [mobileTicketIdentifier(parsed.data.ticket)],
    );
    await client.query(
      `INSERT INTO "session"
        (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id)
       VALUES ($1,$2,$3,now(),now(),NULL,'VastMind mobile app',$4)`,
      [mobileSessionId, expiresAt, accessToken, details.userId],
    );
    await client.query("COMMIT");
    res.status(200).json({ accessToken, userId: details.userId, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* The transaction may already be committed. */ }
    throw error;
  } finally {
    client.release();
  }
});

// Possession of the random native token proves the caller owns this session;
// deleting it invalidates future API and realtime connections immediately.
router.post("/identity/mobile-session-revoke", async (req, res) => {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  assert(token && token.length <= 256, 401, "A VastMind mobile session is required.");
  await query(`DELETE FROM "session" WHERE token=$1 AND user_agent='VastMind mobile app'`, [token]);
  res.status(200).json({ revoked: true });
});

type SessionIdentity = {
  userId: string;
  sessionId: string;
  provider: "vastmind" | "clerk";
};

async function currentSessionIdentity(req: Parameters<typeof getAuth>[0]): Promise<SessionIdentity | null> {
  const bearerToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearerToken) {
    const nativeSession = await mobileSessionFromToken(bearerToken);
    if (nativeSession) return { ...nativeSession, provider: "vastmind" };
  }

  const passkeySession = await vastMindAuth.api.getSession({ headers: requestHeaders(req) });
  if (passkeySession?.user.id && passkeySession.session.id) {
    return { userId: passkeySession.user.id, sessionId: passkeySession.session.id, provider: "vastmind" };
  }

  const legacy = getAuth(req);
  if (legacy.userId && legacy.sessionId) {
    return { userId: legacy.userId, sessionId: legacy.sessionId, provider: "clerk" };
  }
  return null;
}

// Deliberately return only a broad app/browser label and session dates. IP,
// location, browser details, and device fingerprints never leave the server.
router.get("/identity/sessions", async (req, res): Promise<void> => {
  const current = await currentSessionIdentity(req);
  assert(current, 401, "Sign in to review your sessions.");

  const { rows } = await pool.query<{
    id: string;
    created_at: Date | string;
    expires_at: Date | string;
    user_agent: string | null;
  }>(
    `SELECT id, created_at, expires_at, user_agent
     FROM "session"
     WHERE user_id=$1 AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 100`,
    [current.userId],
  );

  const sessions: Array<{
    id: string;
    provider: "vastmind" | "clerk";
    kind: "web" | "mobile";
    createdAt: string;
    expiresAt: string;
    current: boolean;
  }> = rows.map((session) => ({
    id: `vm:${session.id}`,
    provider: "vastmind" as const,
    kind: session.user_agent === "VastMind mobile app" ? "mobile" as const : "web" as const,
    createdAt: new Date(session.created_at).toISOString(),
    expiresAt: new Date(session.expires_at).toISOString(),
    current: current.provider === "vastmind" && current.sessionId === session.id,
  }));

  // Clerk is retained only as a migration bridge. Ask it for session records
  // only for legacy Clerk IDs, then project them into the same minimal shape.
  if (current.userId.startsWith("user_")) {
    const legacySessions = await clerkClient.sessions.getSessionList({
      userId: current.userId,
      status: "active",
      limit: 100,
    });
    for (const session of legacySessions.data) {
      if (session.expireAt <= Date.now()) continue;
      sessions.push({
        id: `clerk:${session.id}`,
        provider: "clerk",
        kind: "web",
        createdAt: new Date(session.createdAt).toISOString(),
        expiresAt: new Date(session.expireAt).toISOString(),
        current: current.provider === "clerk" && current.sessionId === session.id,
      });
    }
  }

  sessions.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  res.json(ListIdentitySessionsResponse.parse({ items: sessions }));
});

router.delete("/identity/sessions/:sessionId", async (req, res): Promise<void> => {
  const current = await currentSessionIdentity(req);
  assert(current, 401, "Sign in to manage your sessions.");
  const params = RevokeIdentitySessionParams.safeParse(req.params);
  assert(params.success, 400, "Choose a valid session.");
  const [provider, sessionId] = params.data.sessionId.split(/:(.+)/, 2);
  assert(provider && sessionId, 400, "Choose a valid session.");
  assert(
    !(provider === current.provider && sessionId === current.sessionId),
    400,
    "This is the session you are using now. Sign out here to end it.",
  );

  if (provider === "vm") {
    const { rows: [revoked] } = await pool.query(
      `DELETE FROM "session"
       WHERE id=$1 AND user_id=$2 AND expires_at > now()
       RETURNING id`,
      [sessionId, current.userId],
    );
    assert(revoked, 404, "That session is no longer active on this account.");
  } else if (provider === "clerk" && current.userId.startsWith("user_")) {
    let session;
    try {
      session = await clerkClient.sessions.getSession(sessionId);
    } catch {
      throw new HttpError(404, "That session is no longer active on this account.");
    }
    assert(
      session.userId === current.userId && session.status === "active",
      404,
      "That session is no longer active on this account.",
    );
    await clerkClient.sessions.revokeSession(sessionId);
  } else {
    throw new HttpError(404, "That session is no longer active on this account.");
  }

  res.json(RevokeIdentitySessionResponse.parse({ revoked: true }));
});

export default router;
