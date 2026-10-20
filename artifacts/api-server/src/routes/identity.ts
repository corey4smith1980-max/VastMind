import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { verifyAccountRecoveryChallenge } from "@workspace/mail-crypto";
import { pool } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { assert, HttpError, query, provision, uuid } from "../lib/social";
import {
  authenticatedUserId,
  createRegistrationIntent,
} from "../lib/vastmind-auth";

const router = Router();
const usernameSchema = z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/);
const recoveryPublicKeySchema = z.string().regex(/^[0-9a-f]{64}$/i);
const identityLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
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
  const currentId = await authenticatedUserId(req);
  if (currentId && !legacyClerkUserId) {
    throw new HttpError(409, "You are already signed in with a VastMind passkey.");
  }

  let userId = legacyClerkUserId ?? uuid();
  let displayName = parsed.data.displayName;
  if (legacyClerkUserId) {
    const current = await provision(legacyClerkUserId);
    if (!parsed.data.displayName) displayName = current.name;
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

export default router;
