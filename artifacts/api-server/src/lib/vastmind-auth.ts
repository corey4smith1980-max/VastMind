import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
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
import { ensureSessionId } from "./login-reservation";
import { abandonFailedRegistration, finalizePasskeyRegistration } from "./registration-orphans";

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
const rootSecret = process.env.VASTMIND_AUTH_SECRET ?? process.env.SESSION_SECRET;
if (!rootSecret || rootSecret.length < 32) {
  throw new Error("A 32-character VASTMIND_AUTH_SECRET or SESSION_SECRET is required.");
}
const authSecret = createHmac("sha256", rootSecret).update("vastmind-auth-session-v1").digest("hex");

const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const deviceLinkSessionContext = new AsyncLocalStorage<{ userId: string }>();

/** Limit the active-session exception to the password-verified QR completion call. */
export function withDeviceLinkSession<T>(userId: string, action: () => Promise<T>): Promise<T> {
  return deviceLinkSessionContext.run({ userId }, action);
}

// The synthetic .invalid address is internal to Better Auth and never sends
// email. Password sign-in is gated by a separately enrolled device token.
export const vastMindAuth = betterAuth({
  appName: "VastMind",
  telemetry: { enabled: false },
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
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 6,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  trustedOrigins: [canonicalOrigin],
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for"],
      // The API is only reached through the Railway gateway on the private network.
      trustedProxies: ["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"],
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  databaseHooks: {
    session: {
      create: {
        // Only one unpaired active session can exist. A second session is
        // allowed only while a one-time QR request is being completed.
        // Authentication does not store a device fingerprint, IP, or user agent.
        before: async (session) => {
          const reserved = ensureSessionId(session);
          try {
          const { rows: [active] } = await pool.query<{ active: boolean }>(
            `SELECT EXISTS(
               SELECT 1 FROM "session" WHERE user_id=$1 AND expires_at > now()
             ) AS active`,
            [session.userId],
          );
          if (active?.active) {
            const pairingContext = deviceLinkSessionContext.getStore();
            let approvedPairing = false;
            if (pairingContext?.userId === session.userId) {
              const { rowCount } = await pool.query(
                `SELECT id FROM identity_device_link_request
                 WHERE approved_user_id=$1 AND status='processing' AND expires_at > now()
                 LIMIT 1`,
                [session.userId],
              );
              approvedPairing = (rowCount ?? 0) > 0;
            }
            if (!approvedPairing) {
              throw APIError.from("FORBIDDEN", {
                code: "DEVICE_LINK_REQUIRED",
                message: "This account already has an active device. Use its QR approval to add this device.",
              });
            }
          }
          await pool.query("DELETE FROM identity_login_reservation WHERE expires_at <= now()");
          const { rowCount } = await pool.query(
            `INSERT INTO identity_login_reservation (user_id,session_id,expires_at)
             VALUES ($1,$2,now() + interval '2 minutes')
             ON CONFLICT (user_id) DO UPDATE
             SET session_id=EXCLUDED.session_id,expires_at=EXCLUDED.expires_at
             WHERE identity_login_reservation.expires_at <= now()
             RETURNING user_id`,
            [reserved.userId, reserved.id],
          );
          if (!rowCount) {
            throw APIError.from("FORBIDDEN", {
              code: "DEVICE_LOGIN_IN_PROGRESS",
              message: "Another sign-in is already being completed for this VastMind account.",
            });
          }
          return { data: { ...reserved, ipAddress: null, userAgent: null } };
          } catch (error) {
            if (!(error instanceof APIError) && typeof reserved.userId === "string") {
              await abandonFailedRegistration(reserved.userId).catch(() => undefined);
            }
            throw error;
          }
        },
        after: async (session) => {
          await pool.query(
            `DELETE FROM identity_login_reservation WHERE user_id=$1 AND session_id=$2`,
            [session.userId, session.id],
          );
          await finalizePasskeyRegistration(session.userId);
        },
      },
    },
  },
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
          const { rows: [intent] } = await pool.query(
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
        afterVerification: async ({ context, user, verification }) => {
          if (!verification.registrationInfo?.userVerified) {
            throw APIError.from("BAD_REQUEST", { code: "PASSKEY_NOT_VERIFIED", message: "Verify your device to register a passkey." });
          }
          // Session-authenticated members may add a second passkey without a
          // public registration intent; the plugin checks session ownership.
          if (!context) return;
          if (context.length > 256) throw APIError.from("BAD_REQUEST", { code: "REGISTRATION_UNAVAILABLE", message: "Registration is unavailable." });
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            const { rows: [intent] } = await client.query(
              `SELECT user_id, username, display_name, recovery_public_key
               FROM passkey_registration_intent
               WHERE token_hash=$1 AND expires_at > now() AND used_at IS NULL
               FOR UPDATE`,
              [tokenHash(context)],
            );
            if (!intent || intent.user_id !== user.id) {
              throw APIError.from("BAD_REQUEST", { code: "REGISTRATION_UNAVAILABLE", message: "Registration is unavailable or expired." });
            }
            const { rows: [taken] } = await client.query(
              "SELECT id FROM users WHERE lower(username)=lower($1) AND id<>$2",
              [intent.username, intent.user_id],
            );
            if (taken) throw APIError.from("CONFLICT", { code: "USERNAME_TAKEN", message: "That VastMind ID is already in use." });
            await client.query(
              `INSERT INTO "user" (id, name, email, email_verified)
               VALUES ($1,$2,$3,false) ON CONFLICT (id) DO NOTHING`,
              [intent.user_id, intent.display_name, `${intent.user_id}@users.vastmind.invalid`],
            );
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
            await client.query(
              `UPDATE passkey_registration_intent SET used_at=now()
               WHERE user_id=$1 AND used_at IS NULL`,
              [intent.user_id],
            );
            await client.query("COMMIT");
            return { userId: intent.user_id };
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        },
      },
      authentication: {
        afterVerification: async ({ verification }) => {
          if (!verification.authenticationInfo.userVerified) throw new Error("Verify your device to sign in.");
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

/** Resolve a native-only bearer token stored as a revocable Better Auth session. */
export async function mobileSessionFromToken(token: string): Promise<{ userId: string; sessionId: string } | null> {
  if (!token || token.length > 256) return null;
  const { rows: [session] } = await pool.query<{ user_id: string; id: string }>(
    `SELECT id, user_id FROM "session" WHERE token=$1 AND expires_at > now()`,
    [token],
  );
  return session ? { userId: session.user_id, sessionId: session.id } : null;
}

/** Resolve either a legacy Clerk account or a new VastMind passkey session. */
export async function authenticatedUserId(req: Request): Promise<string | null> {
  const bearerToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearerToken) {
    const mobileSession = await mobileSessionFromToken(bearerToken);
    if (mobileSession) return mobileSession.userId;
  }
  const session = await vastMindAuth.api.getSession({ headers: requestHeaders(req) });
  if (session?.user.id) return session.user.id;
  return getAuth(req).userId ?? null;
}

/** Create an opaque, expiring passkey-registration intent. */
export async function createRegistrationIntent(input: {
  userId: string;
  username: string;
  displayName: string;
  recoveryPublicKey: string;
}): Promise<string> {
  await pool.query("DELETE FROM passkey_registration_intent WHERE expires_at < now() - interval '1 day'");
  const rawToken = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO passkey_registration_intent
      (id, token_hash, user_id, username, display_name, recovery_public_key, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,now() + interval '10 minutes')`,
    [randomUUID(), tokenHash(rawToken), input.userId, input.username, input.displayName, input.recoveryPublicKey],
  );
  return rawToken;
}
