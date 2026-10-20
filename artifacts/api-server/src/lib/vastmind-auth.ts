import { createHash, randomBytes, randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { passkey } from "@better-auth/passkey";
import { db, pool } from "@workspace/db";
import {
  authAccount,
  authPasskey,
  authSession,
  authUser,
  authVerification,
} from "@workspace/db";
import { getAuth } from "@clerk/express";
import type { Request } from "express";

function getCanonicalOrigin(): string {
  const configured = process.env.VASTMIND_AUTH_URL
    ?? (process.env.NODE_ENV === "production"
      ? process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
      : process.env.REPLIT_DEV_DOMAIN?.trim());
  if (!configured) throw new Error("VASTMIND_AUTH_URL must be configured for passkey sign-in.");
  const url = new URL(configured.startsWith("http") ? configured : `https://${configured}`);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("Passkey authentication requires HTTPS.");
  }
  return url.origin;
}

const canonicalOrigin = getCanonicalOrigin();
const authSecret = process.env.VASTMIND_AUTH_SECRET ?? process.env.SESSION_SECRET;
if (!authSecret || authSecret.length < 32) {
  throw new Error("A 32-character VASTMIND_AUTH_SECRET or SESSION_SECRET is required.");
}

const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

// Better Auth provides passwordless passkey sessions. The synthetic .invalid
// address remains internal to the required auth schema and never sends email.
export const vastMindAuth = betterAuth({
  appName: "VastMind",
  baseURL: canonicalOrigin,
  basePath: "/api/auth",
  secret: authSecret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: authUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
      passkey: authPasskey,
    },
  }),
  emailAndPassword: { enabled: false },
  trustedOrigins: [canonicalOrigin],
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  plugins: [
    passkey({
      rpID: new URL(canonicalOrigin).hostname,
      rpName: "VastMind",
      origin: canonicalOrigin,
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      registration: {
        requireSession: false,
        resolveUser: async ({ context }) => {
          if (!context || context.length > 256) throw new Error("Registration is unavailable.");
          const [intent] = await pool.query(
            `SELECT user_id, username FROM passkey_registration_intent
             WHERE token_hash=$1 AND expires_at > now() AND used_at IS NULL`,
            [tokenHash(context)],
          );
          if (!intent) throw new Error("Registration is unavailable or expired.");
          return {
            id: intent.user_id,
            name: intent.username,
            displayName: `${intent.username}@vastmind.com`,
          };
        },
        afterVerification: async ({ context, user, ctx }) => {
          if (!context || context.length > 256) throw new Error("Registration is unavailable.");
          const [intent] = await pool.query(
            `SELECT user_id, username, display_name, recovery_public_key
             FROM passkey_registration_intent
             WHERE token_hash=$1 AND expires_at > now() AND used_at IS NULL`,
            [tokenHash(context)],
          );
          if (!intent || intent.user_id !== user.id) throw new Error("Registration is unavailable or expired.");

          const [existingAuthUser] = await pool.query('SELECT id FROM "user" WHERE id=$1', [intent.user_id]);
          if (!existingAuthUser) {
            await ctx.context.internalAdapter.createUser({
              id: intent.user_id,
              name: intent.display_name,
              email: `${intent.user_id}@users.vastmind.invalid`,
              emailVerified: false,
            });
          }

          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            const claimed = await client.query(
              `UPDATE passkey_registration_intent SET used_at=now()
               WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
              [tokenHash(context)],
            );
            if (!claimed.rowCount) throw new Error("Registration was already used or expired.");
            await client.query(
              `INSERT INTO users (id, name, username, email)
               VALUES ($1, $2, $3, NULL)
               ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, username=EXCLUDED.username`,
              [intent.user_id, intent.display_name, intent.username],
            );
            await client.query(
              `INSERT INTO account_recovery_key (user_id, public_key)
               VALUES ($1, $2)
               ON CONFLICT (user_id) DO UPDATE SET public_key=EXCLUDED.public_key, rotated_at=now()`,
              [intent.user_id, intent.recovery_public_key],
            );
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
          return { userId: intent.user_id };
        },
      },
    }),
  ],
});

/** Return request headers in the Web API format Better Auth expects. */
export function requestHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(",") : value);
  }
  return headers;
}

/** Resolve either a legacy Clerk account or a new VastMind passkey session. */
export async function authenticatedUserId(req: Request): Promise<string | null> {
  const clerkUserId = getAuth(req).userId;
  if (clerkUserId) return clerkUserId;
  const session = await vastMindAuth.api.getSession({ headers: requestHeaders(req) });
  return session?.user.id ?? null;
}

/** Create an opaque, expiring passkey-registration intent. */
export async function createRegistrationIntent(input: {
  userId: string;
  username: string;
  displayName: string;
  recoveryPublicKey: string;
}): Promise<string> {
  const rawToken = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO passkey_registration_intent
      (id, token_hash, user_id, username, display_name, recovery_public_key, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,now() + interval '10 minutes')`,
    [randomUUID(), tokenHash(rawToken), input.userId, input.username, input.displayName, input.recoveryPublicKey],
  );
  return rawToken;
}
