import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import QRCode from "qrcode";
import { hashPassword } from "better-auth/crypto";
import { verifyAccountRecoveryChallenge } from "@workspace/mail-crypto";
import { pool } from "@workspace/db";
import { clerkClient, getAuth } from "@clerk/express";
import {
  ApproveIdentityDeviceLinkBody,
  ApproveIdentityDeviceLinkResponse,
  CompleteIdentityDeviceLinkBody,
  CompleteIdentityDeviceLinkResponse,
  GetIdentityDeviceLinkStatusBody,
  GetIdentityDeviceLinkStatusResponse,
  ListIdentitySessionsResponse,
  RevokeIdentitySessionParams,
  RevokeIdentitySessionResponse,
  StartIdentityDeviceLinkResponse,
} from "@workspace/api-zod";
import { assert, HttpError, query, provision, uuid } from "../lib/social";
import { changed } from "../lib/realtime";
import {
  createRegistrationIntent,
  mobileSessionFromToken,
  requestHeaders,
  vastMindAuth,
  withDeviceLinkSession,
} from "../lib/vastmind-auth";
import {
  createTrustedDeviceToken,
  hashTrustedDeviceToken,
  setTrustedDeviceCookie,
  clearTrustedDeviceCookie,
  trustedDeviceTokenFromRequest,
  TRUSTED_DEVICE_TTL_MS,
} from "../lib/trusted-device";
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
const deviceLinkStatusLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
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

function deviceLinkTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function sendDeviceSecurityAlert(userId: string, title: string, body: string): Promise<void> {
  // Insert directly rather than through notify(), which suppresses self-authored
  // events. This is a system security event and is delivered through realtime.
  await pool.query(
    `INSERT INTO notifications (id,user_id,actor_id,type,title,body)
     VALUES ($1,$2,$2,'security_alert',$3,$4)`,
    [randomUUID(), userId, title, body],
  );
  changed([userId], "notifications");
}

// A new device presents this short-lived QR. The one-time token is returned to
// that device and encoded in the QR; the database stores only its SHA-256 hash.
router.post("/identity/device-link-requests", identityLimiter, async (req, res): Promise<void> => {
  assert(!(await currentSessionIdentity(req)), 409, "Start device linking from the device you want to add.");
  await pool.query(
    `DELETE FROM identity_device_link_request
     WHERE expires_at < now() - interval '1 day'`,
  );
  const requestId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 3 * 60_000);
  const qrPayload = JSON.stringify({ app: "VastMind", action: "device-link", version: 1, requestId, token });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
    color: { dark: "#07111f", light: "#ffffff" },
  });
  await pool.query(
    `INSERT INTO identity_device_link_request (id,token_hash,expires_at)
     VALUES ($1,$2,$3)`,
    [requestId, deviceLinkTokenHash(token), expiresAt],
  );
  res.status(201).json(StartIdentityDeviceLinkResponse.parse({
    requestId,
    token,
    qrDataUrl,
    expiresAt: expiresAt.toISOString(),
  }));
});

// The new device polls using its one-time secret, never the request ID alone.
router.post("/identity/device-link-status", deviceLinkStatusLimiter, async (req, res): Promise<void> => {
  const parsed = GetIdentityDeviceLinkStatusBody.safeParse(req.body);
  assert(parsed.success, 400, "The device-link request is invalid.");
  const { rows: [link] } = await pool.query<{
    token_hash: string; status: string; expires_at: Date;
  }>(
    `SELECT token_hash,status,expires_at FROM identity_device_link_request WHERE id=$1`,
    [parsed.data.requestId],
  );
  assert(link && constantTimeEqual(link.token_hash, deviceLinkTokenHash(parsed.data.token)), 404, "The device-link request expired or was not found.");
  const expired = new Date(link.expires_at).getTime() <= Date.now() && link.status !== "completed";
  res.json(GetIdentityDeviceLinkStatusResponse.parse({
    status: expired ? "expired" : link.status,
    expiresAt: new Date(link.expires_at).toISOString(),
  }));
});

// Only an authenticated VastMind session can authorize adding another device.
// Approval immediately records a critical in-app security notification.
router.post("/identity/device-link-approve", identityLimiter, async (req, res): Promise<void> => {
  const parsed = ApproveIdentityDeviceLinkBody.safeParse(req.body);
  assert(parsed.success, 400, "The device-link request is invalid.");
  const current = await currentSessionIdentity(req);
  assert(current?.provider === "vastmind", 401, "Approve this request from a signed-in VastMind device.");
  const { rows: [link] } = await pool.query<{ token_hash: string; expires_at: Date }>(
    `SELECT token_hash,expires_at
     FROM identity_device_link_request
     WHERE id=$1 AND status='pending'`,
    [parsed.data.requestId],
  );
  assert(link && constantTimeEqual(link.token_hash, deviceLinkTokenHash(parsed.data.token))
    && new Date(link.expires_at).getTime() > Date.now(), 409, "This QR request has expired or was already handled.");
  const approved = await pool.query(
    `UPDATE identity_device_link_request
     SET status='approved',approved_user_id=$2,approved_session_id=$3,approved_at=now()
     WHERE id=$1 AND status='pending' AND expires_at > now()`,
    [parsed.data.requestId, current.userId, current.sessionId],
  );
  assert(approved.rowCount, 409, "This QR request has expired or was already handled.");
  const expiresAt = new Date(link.expires_at).toISOString();
  await sendDeviceSecurityAlert(
    current.userId,
    "CRITICAL SECURITY ALERT — New device approved",
    "A new device QR was approved for your VastMind account. It still needs your password to finish sign-in. If this was not you, revoke unfamiliar sessions in Account Security.",
  );
  res.json(ApproveIdentityDeviceLinkResponse.parse({ status: "approved", expiresAt }));
});

// Finish pairing only after the existing device approved the QR and the new
// device proves knowledge of the account password.
router.post("/identity/device-link-complete", identityLimiter, async (req, res): Promise<void> => {
  const parsed = CompleteIdentityDeviceLinkBody.safeParse(req.body);
  assert(parsed.success, 400, "Enter the password for this VastMind account.");
  assert(!(await currentSessionIdentity(req)), 409, "This device is already signed in.");

  const claimClient = await pool.connect();
  let userId: string;
  try {
    await claimClient.query("BEGIN");
    const { rows: [link] } = await claimClient.query<{
      token_hash: string; approved_user_id: string | null; status: string; expires_at: Date; attempts: number;
    }>(
      `SELECT token_hash,approved_user_id,status,expires_at,attempts
       FROM identity_device_link_request WHERE id=$1 FOR UPDATE`,
      [parsed.data.requestId],
    );
    assert(link && constantTimeEqual(link.token_hash, deviceLinkTokenHash(parsed.data.token))
      && link.status === "approved" && link.approved_user_id
      && new Date(link.expires_at).getTime() > Date.now()
      && link.attempts < 5, 401, "This QR approval is expired or unavailable.");
    await claimClient.query("SELECT pg_advisory_xact_lock(hashtext($1))", [link.approved_user_id]);
    const { rowCount: processingCount } = await claimClient.query(
      `SELECT id FROM identity_device_link_request
       WHERE approved_user_id=$1 AND status='processing' LIMIT 1`,
      [link.approved_user_id],
    );
    assert(!processingCount, 409, "Another device is finishing sign-in. Try again in a moment.");
    await claimClient.query(
      `UPDATE identity_device_link_request SET status='processing' WHERE id=$1`,
      [parsed.data.requestId],
    );
    userId = link.approved_user_id;
    await claimClient.query("COMMIT");
  } catch (error) {
    await claimClient.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    claimClient.release();
  }

  const { rows: [account] } = await pool.query<{ email: string }>(
    `SELECT email FROM "user" WHERE id=$1`,
    [userId!],
  );
  if (!account) {
    await pool.query(
      `UPDATE identity_device_link_request SET status='expired'
       WHERE id=$1 AND status='processing'`,
      [parsed.data.requestId],
    );
    throw new HttpError(401, "This VastMind account is unavailable.");
  }

  let signInResponse: Response;
  try {
    signInResponse = await withDeviceLinkSession(userId!, () => vastMindAuth.api.signInEmail({
        body: { email: account.email, password: parsed.data.password, rememberMe: true },
        headers: requestHeaders(req),
        asResponse: true,
      }));
  } catch {
    signInResponse = new Response(null, { status: 401 });
  }
  if (!signInResponse.ok) {
    await pool.query(
      `UPDATE identity_device_link_request
       SET attempts=attempts+1,
           status=CASE WHEN attempts >= 4 OR expires_at <= now() THEN 'expired' ELSE 'approved' END
       WHERE id=$1 AND status='processing'`,
      [parsed.data.requestId],
    );
    throw new HttpError(401, "The password is incorrect or the QR approval expired.");
  }

  let signInResult: { token?: string };
  try {
    signInResult = await signInResponse.json() as { token?: string };
  } catch {
    signInResult = {};
  }
  if (!signInResult.token) {
    await pool.query(
      `UPDATE identity_device_link_request SET status='approved'
       WHERE id=$1 AND status='processing'`,
      [parsed.data.requestId],
    );
    throw new HttpError(401, "The password could not be verified.");
  }
  const { rows: [session] } = await pool.query<{ id: string; expires_at: Date }>(
    `SELECT id,expires_at FROM "session" WHERE token=$1 AND user_id=$2`,
    [signInResult.token, userId!],
  );
  if (!session) {
    await pool.query(
      `UPDATE identity_device_link_request SET status='approved'
       WHERE id=$1 AND status='processing'`,
      [parsed.data.requestId],
    );
    throw new HttpError(401, "The signed-in device session could not be created.");
  }

  const native = isNativeRequest(req);
  const trustToken = createTrustedDeviceToken();
  const trustedDeviceId = randomUUID();
  const trustedExpiresAt = new Date(Date.now() + TRUSTED_DEVICE_TTL_MS);
  const finalizeClient = await pool.connect();
  try {
    await finalizeClient.query("BEGIN");
    await finalizeClient.query(
      `INSERT INTO identity_password_session (session_id,user_id) VALUES ($1,$2)`,
      [session.id, userId!],
    );
    await finalizeClient.query(
      `INSERT INTO identity_trusted_device
       (id,user_id,token_hash,kind,expires_at,last_used_at,last_session_id)
       VALUES ($1,$2,$3,$4,$5,now(),$6)`,
      [trustedDeviceId, userId!, hashTrustedDeviceToken(trustToken), native ? "mobile" : "web", trustedExpiresAt, session.id],
    );
    await finalizeClient.query(
      `UPDATE identity_device_link_request
       SET status='completed',completed_at=now()
       WHERE id=$1 AND status='processing'`,
      [parsed.data.requestId],
    );
    await finalizeClient.query("COMMIT");
  } catch (error) {
    await finalizeClient.query("ROLLBACK").catch(() => undefined);
    await pool.query(`DELETE FROM "session" WHERE id=$1 AND user_id=$2`, [session.id, userId!]);
    await pool.query(
      `UPDATE identity_device_link_request SET status='approved'
       WHERE id=$1 AND status='processing'`,
      [parsed.data.requestId],
    );
    throw error;
  } finally {
    finalizeClient.release();
  }

  await sendDeviceSecurityAlert(
    userId!,
    "VastMind security — New device signed in",
    "A new device completed QR approval and password verification. If this was not you, revoke unfamiliar sessions in Account Security.",
  );
  if (native) {
    res.json(CompleteIdentityDeviceLinkResponse.parse({
      signedIn: true,
      accessToken: signInResult.token,
      deviceTrustToken: trustToken,
      userId: userId!,
      expiresAt: new Date(session.expires_at).toISOString(),
    }));
    return;
  }
  for (const cookie of signInResponse.headers.getSetCookie()) res.append("Set-Cookie", cookie);
  setTrustedDeviceCookie(res, trustToken);
  res.json(CompleteIdentityDeviceLinkResponse.parse({ signedIn: true }));
});

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
  const deviceTrustToken = createTrustedDeviceToken();
  const mobileSessionId = randomUUID();
  const trustedDeviceId = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  const trustedDeviceExpiresAt = new Date(Date.now() + TRUSTED_DEVICE_TTL_MS);
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
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [details.userId]);
    const { rows: [otherSessions] } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "session"
       WHERE user_id=$1 AND expires_at > now() AND id<>$2`,
      [details.userId, details.webSessionId],
    );
    assert(
      Number(otherSessions?.count ?? 0) === 0,
      409,
      "This account already has another active device. Use QR linking from that device.",
    );

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
    await client.query(
      `INSERT INTO identity_trusted_device
        (id, user_id, token_hash, kind, expires_at, last_used_at, last_session_id)
       VALUES ($1,$2,$3,'mobile',$4,now(),$5)`,
      [trustedDeviceId, details.userId, hashTrustedDeviceToken(deviceTrustToken), trustedDeviceExpiresAt, mobileSessionId],
    );
    // The browser session was only a temporary passkey handoff. Replacing it
    // prevents one mobile sign-in from leaving two live sessions behind.
    await client.query(
      `DELETE FROM "session" WHERE id=$1 AND user_id=$2`,
      [details.webSessionId, details.userId],
    );
    await client.query("COMMIT");
    res.status(200).json({
      accessToken,
      userId: details.userId,
      expiresAt: expiresAt.toISOString(),
      deviceTrustToken,
    });
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

function isNativeRequest(req: Parameters<typeof getAuth>[0]): boolean {
  return req.get("x-vastmind-client") === "mobile";
}

async function sessionMethod(userId: string, sessionId: string): Promise<string | null> {
  const { rows: [session] } = await pool.query<{ session_id: string }>(
    `SELECT s.id AS session_id FROM "session" s
     WHERE s.id=$1 AND s.user_id=$2 AND s.expires_at > now()
       AND EXISTS (SELECT 1 FROM identity_password_session p WHERE p.session_id=s.id AND p.user_id=s.user_id)`,
    [sessionId, userId],
  );
  return session ? "password" : null;
}

async function trustedDeviceForRequest(
  req: Parameters<typeof getAuth>[0],
  userId: string,
): Promise<{ id: string; expiresAt: Date } | null> {
  const token = trustedDeviceTokenFromRequest(req);
  if (!token) return null;
  const { rows: [device] } = await pool.query<{ id: string; expires_at: Date }>(
    `SELECT id, expires_at FROM identity_trusted_device
     WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at > now()`,
    [hashTrustedDeviceToken(token), userId],
  );
  return device ? { id: device.id, expiresAt: device.expires_at } : null;
}

// Username/password is a convenience for devices that were explicitly enrolled
// with a passkey or recovery flow. Passwords alone never enroll new devices.
router.post("/identity/password-sign-in", identityLimiter, async (req, res): Promise<void> => {
  const parsed = z.object({
    username: usernameSchema,
    password: z.string().min(1).max(128),
  }).safeParse(req.body);
  assert(parsed.success, 400, "Enter your VastMind username and password.");
  const username = parsed.data.username.toLowerCase();
  const { rows: [user] } = await pool.query<{ id: string; email: string }>(
    `SELECT u.id, a.email
     FROM users u JOIN "user" a ON a.id=u.id
     WHERE lower(u.username)=lower($1)`,
    [username],
  );
  const trust = user ? await trustedDeviceForRequest(req, user.id) : null;
  assert(trust, 403, "This device is not trusted yet. Sign in with a passkey or recovery phrase first.");
  const { rows: [active] } = await pool.query<{ active: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM "session" WHERE user_id=$1 AND expires_at > now()
     ) AS active`,
    [user!.id],
  );
  assert(
    !active?.active,
    409,
    "This account is active on another device. Use QR linking from that signed-in device.",
  );

  const native = isNativeRequest(req);
  let result: Response;
  try {
    result = await vastMindAuth.api.signInEmail({
      body: { email: user.email, password: parsed.data.password, rememberMe: true },
      headers: requestHeaders(req),
      asResponse: true,
    });
  } catch {
    throw new HttpError(401, "That username or password is incorrect.");
  }
  if (!result.ok) {
    if (result.status === 403) throw new HttpError(409, "This account is active on another device. Use QR linking from that signed-in device.");
    throw new HttpError(401, "That username or password is incorrect.");
  }
  for (const cookie of result.headers.getSetCookie()) res.append("Set-Cookie", cookie);
  let signInResult: { token?: string };
  try {
    signInResult = await result.json() as { token?: string };
  } catch {
    throw new HttpError(401, "That username or password is incorrect.");
  }
  assert(signInResult.token, 401, "That username or password is incorrect.");
  const { rows: [session] } = await pool.query<{ id: string; expires_at: Date }>(
    `SELECT id, expires_at FROM "session" WHERE token=$1 AND user_id=$2`,
    [signInResult.token, user!.id],
  );
  assert(session, 401, "That username or password is incorrect.");
  await pool.query(
    `INSERT INTO identity_password_session (session_id, user_id)
     VALUES ($1,$2) ON CONFLICT (session_id) DO NOTHING`,
    [session.id, user!.id],
  );
  await pool.query(
    `UPDATE identity_trusted_device SET last_used_at=now(), last_session_id=$1
     WHERE id=$2 AND user_id=$3 AND revoked_at IS NULL`,
    [session.id, trust.id, user!.id],
  );

  if (native) {
    res.json({
      signedIn: true,
      accessToken: signInResult.token,
      userId: user!.id,
      expiresAt: new Date(session.expires_at).toISOString(),
    });
    return;
  }
  res.json({ signedIn: true });
});

router.get("/identity/password-status", async (req, res): Promise<void> => {
  const current = await currentSessionIdentity(req);
  assert(current, 401, "Sign in to manage your password.");
  const { rows: [account] } = await pool.query<{ has_password: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM account WHERE user_id=$1 AND provider_id='credential' AND password IS NOT NULL
     ) AS has_password`,
    [current.userId],
  );
  res.json({ enabled: account?.has_password === true });
});

router.post("/identity/password", identityLimiter, async (req, res): Promise<void> => {
  const parsed = z.object({
    newPassword: z.string().min(12).max(128),
    currentPassword: z.string().min(1).max(128).optional(),
  }).safeParse(req.body);
  assert(parsed.success, 400, "Use a password between 12 and 128 characters.");
  const current = await currentSessionIdentity(req);
  assert(current?.provider === "vastmind", 401, "Sign in with a VastMind passkey to manage your password.");
  const method = await sessionMethod(current.userId, current.sessionId);
  const { rows: [credential] } = await pool.query<{ password: string | null }>(
    `SELECT password FROM account WHERE user_id=$1 AND provider_id='credential' LIMIT 1`,
    [current.userId],
  );
  try {
    if (credential?.password) {
      assert(parsed.data.currentPassword, 400, "Enter your current password to change it.");
      await vastMindAuth.api.changePassword({
        body: {
          currentPassword: parsed.data.currentPassword,
          newPassword: parsed.data.newPassword,
          revokeOtherSessions: true,
        },
        headers: requestHeaders(req),
      });
    } else {
      assert(
        method !== "password",
        403,
        "Sign in with a passkey before setting your first password.",
      );
      await vastMindAuth.api.setPassword({
        body: { newPassword: parsed.data.newPassword },
        headers: requestHeaders(req),
      });
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const status = typeof error === "object" && error && "status" in error && typeof error.status === "number"
      ? error.status
      : 400;
    throw new HttpError(status === 401 ? 401 : 400, status === 401
      ? "Your current password or sign-in session is not valid."
      : "The password could not be saved. Check the requirements and try again.");
  }
  res.json({ saved: true });
});

// A passkey- or recovery-authenticated session can replace a forgotten
// password. This operation never enrolls a trusted device; password sign-in
// continues to require an already-issued trusted-device token.
router.post("/identity/password/reset-with-passkey", identityLimiter, async (req, res): Promise<void> => {
  const parsed = z.object({ newPassword: z.string().min(12).max(128) }).safeParse(req.body);
  assert(parsed.success, 400, "Use a password between 12 and 128 characters.");
  const current = await currentSessionIdentity(req);
  assert(current?.provider === "vastmind", 401, "Sign in with a VastMind passkey before resetting this password.");
  const method = await sessionMethod(current.userId, current.sessionId);
  assert(method !== "password", 403, "A password sign-in cannot authorize a password reset. Use a passkey.");

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [session] } = await client.query(
      `SELECT id FROM "session"
       WHERE id=$1 AND user_id=$2 AND expires_at > now()
       FOR UPDATE`,
      [current.sessionId, current.userId],
    );
    assert(session, 401, "Your passkey session expired. Sign in with your passkey again.");
    const reservation = await client.query(
      `INSERT INTO identity_login_reservation (user_id,session_id,expires_at)
       VALUES ($1,$2,now() + interval '2 minutes')
       ON CONFLICT (user_id) DO UPDATE
       SET session_id=EXCLUDED.session_id,expires_at=EXCLUDED.expires_at
       WHERE identity_login_reservation.expires_at <= now()
       RETURNING user_id`,
      [current.userId, current.sessionId],
    );
    assert(reservation.rowCount, 409, "Another sign-in is in progress. Try the password reset again shortly.");

    const { rows: [credential] } = await client.query(
      `SELECT id FROM account
       WHERE user_id=$1 AND provider_id='credential' AND password IS NOT NULL
       FOR UPDATE`,
      [current.userId],
    );
    assert(credential, 409, "This account does not have a password to reset yet.");
    await client.query(
      `UPDATE account SET password=$1,updated_at=now() WHERE id=$2`,
      [passwordHash, credential.id],
    );
    // Password resets end other sessions, while the existing trusted-device
    // records remain unchanged. The current passkey session stays available.
    await client.query(`DELETE FROM "session" WHERE user_id=$1 AND id<>$2`, [current.userId, current.sessionId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.query(
      `DELETE FROM identity_login_reservation WHERE user_id=$1 AND session_id=$2`,
      [current.userId, current.sessionId],
    ).catch(() => undefined);
  }

  await sendDeviceSecurityAlert(
    current.userId,
    "VastMind security — Password reset",
    "Your VastMind password was reset after passkey or recovery verification. Password sign-in remains limited to devices you previously trusted.",
  );
  res.json({ saved: true });
});

router.post("/identity/trusted-devices", async (req, res): Promise<void> => {
  const current = await currentSessionIdentity(req);
  assert(current?.provider === "vastmind", 401, "Sign in with a VastMind passkey before trusting this device.");
  const method = await sessionMethod(current.userId, current.sessionId);
  assert(
    method !== "password",
    403,
    "A password sign-in cannot add a trusted device. Use a passkey or recovery phrase.",
  );
  const kind = isNativeRequest(req) ? "mobile" : "web";
  const token = trustedDeviceTokenFromRequest(req);
  const existing = token ? await trustedDeviceForRequest(req, current.userId) : null;
  if (existing) {
    await pool.query(
      `UPDATE identity_trusted_device SET last_used_at=now(), last_session_id=$1
       WHERE id=$2 AND user_id=$3`,
      [current.sessionId, existing.id, current.userId],
    );
    if (kind === "web") setTrustedDeviceCookie(res, token!);
    res.json({ id: existing.id, expiresAt: existing.expiresAt.toISOString(), ...(kind === "mobile" ? { token } : {}) });
    return;
  }
  const { rows: [count] } = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM identity_trusted_device
     WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now()`,
    [current.userId],
  );
  assert(Number(count?.count ?? 0) < 20, 400, "This account already has 20 trusted devices. Revoke an older one first.");
  const newToken = createTrustedDeviceToken();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_TTL_MS);
  await pool.query(
    `INSERT INTO identity_trusted_device
      (id, user_id, token_hash, kind, expires_at, last_used_at, last_session_id)
     VALUES ($1,$2,$3,$4,$5,now(),$6)`,
    [id, current.userId, hashTrustedDeviceToken(newToken), kind, expiresAt, current.sessionId],
  );
  if (kind === "web") setTrustedDeviceCookie(res, newToken);
  res.status(201).json({ id, expiresAt: expiresAt.toISOString(), ...(kind === "mobile" ? { token: newToken } : {}) });
});

router.get("/identity/trusted-devices", async (req, res): Promise<void> => {
  const current = await currentSessionIdentity(req);
  assert(current, 401, "Sign in to review trusted devices.");
  const currentToken = trustedDeviceTokenFromRequest(req);
  const currentHash = currentToken ? hashTrustedDeviceToken(currentToken) : null;
  const { rows } = await pool.query<{
    id: string; kind: string; created_at: Date; expires_at: Date; last_used_at: Date | null; token_hash: string;
  }>(
    `SELECT id, kind, created_at, expires_at, last_used_at, token_hash
     FROM identity_trusted_device
     WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now()
     ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
    [current.userId],
  );
  res.json({
    items: rows.map((device) => ({
      id: device.id,
      kind: device.kind === "mobile" ? "mobile" : "web",
      createdAt: new Date(device.created_at).toISOString(),
      expiresAt: new Date(device.expires_at).toISOString(),
      lastUsedAt: device.last_used_at ? new Date(device.last_used_at).toISOString() : null,
      current: currentHash === device.token_hash,
    })),
  });
});

router.get("/identity/trusted-device-status", async (req, res): Promise<void> => {
  const token = trustedDeviceTokenFromRequest(req);
  if (!token) {
    res.json({ trusted: false });
    return;
  }
  const { rowCount } = await pool.query(
    `SELECT id FROM identity_trusted_device
     WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()`,
    [hashTrustedDeviceToken(token)],
  );
  res.json({ trusted: (rowCount ?? 0) > 0 });
});

router.delete("/identity/trusted-devices/:deviceId", async (req, res): Promise<void> => {
  const current = await currentSessionIdentity(req);
  assert(current, 401, "Sign in to manage trusted devices.");
  const id = z.string().uuid().safeParse(req.params.deviceId);
  assert(id.success, 400, "Choose a valid trusted device.");
  const { rows: [device] } = await pool.query<{ token_hash: string; last_session_id: string | null }>(
    `UPDATE identity_trusted_device SET revoked_at=now()
     WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL
     RETURNING token_hash, last_session_id`,
    [id.data, current.userId],
  );
  assert(device, 404, "That trusted device was not found.");
  const token = trustedDeviceTokenFromRequest(req);
  const isCurrent = !!token && hashTrustedDeviceToken(token) === device.token_hash;
  if (device.last_session_id && !isCurrent) {
    await pool.query(`DELETE FROM "session" WHERE id=$1 AND user_id=$2`, [device.last_session_id, current.userId]);
  }
  if (isCurrent) {
    clearTrustedDeviceCookie(res);
    if (isNativeRequest(req)) res.setHeader("X-VastMind-Trust-Revoked", "true");
  }
  res.json({ revoked: true });
});

router.put("/identity/recovery-key", async (req, res): Promise<void> => {
  const parsed = z.object({ publicKey: recoveryPublicKeySchema }).safeParse(req.body);
  assert(parsed.success, 400, "The recovery key is invalid.");
  const current = await currentSessionIdentity(req);
  assert(current?.provider === "vastmind", 401, "Sign in with a VastMind passkey to update recovery.");
  const method = await sessionMethod(current.userId, current.sessionId);
  assert(
    method !== "password",
    403,
    "Use a passkey sign-in before replacing your recovery phrase.",
  );
  const result = await pool.query(
    `UPDATE account_recovery_key SET public_key=$1, rotated_at=now()
     WHERE user_id=$2`,
    [parsed.data.publicKey.toLowerCase(), current.userId],
  );
  assert(result.rowCount, 404, "This account has no recovery key to replace.");
  res.json({ saved: true });
});

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
    kind: session.user_agent?.includes("mobile") ? "mobile" as const : "web" as const,
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
    await pool.query(
      `UPDATE identity_trusted_device SET revoked_at=now()
       WHERE user_id=$1 AND last_session_id=$2 AND revoked_at IS NULL`,
      [current.userId, sessionId],
    );
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
