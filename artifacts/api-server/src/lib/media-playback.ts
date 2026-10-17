import { createHmac, timingSafeEqual } from "node:crypto";

export const MEDIA_PLAYBACK_TTL_MS = 15 * 60_000;
const TOKEN_VERSION = 1;

type PlaybackClaims = {
  version: number;
  mediaId: string;
  viewerId: string;
  expiresAt: number;
};

function playbackKey(secret: string) {
  if (secret.length < 32) throw new Error("SESSION_SECRET must be configured before issuing private media playback links");
  return createHmac("sha256", secret).update("vastmind/private-media-playback/v1").digest();
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", playbackKey(secret)).update(payload).digest("base64url");
}

/** A short-lived, media- and viewer-bound ticket for native/web range playback. */
export function issueMediaPlaybackTicket(mediaId: string, viewerId: string, secret: string, now = Date.now()) {
  const expiresAt = now + MEDIA_PLAYBACK_TTL_MS;
  const payload = Buffer.from(JSON.stringify({
    version: TOKEN_VERSION,
    mediaId,
    viewerId,
    expiresAt,
  })).toString("base64url");
  return { token: `${payload}.${signature(payload, secret)}`, expiresAt };
}

/** Verify tickets before using the viewer identity for the route's normal ACL checks. */
export function verifyMediaPlaybackTicket(token: unknown, mediaId: string, secret: string, now = Date.now()) {
  if (typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;

  let expected: Buffer;
  let supplied: Buffer;
  try {
    expected = Buffer.from(signature(parts[0], secret), "base64url");
    supplied = Buffer.from(parts[1], "base64url");
  } catch {
    return null;
  }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Partial<PlaybackClaims>;
    if (claims.version !== TOKEN_VERSION
      || claims.mediaId !== mediaId
      || typeof claims.viewerId !== "string"
      || !claims.viewerId
      || typeof claims.expiresAt !== "number"
      || claims.expiresAt <= now
      || claims.expiresAt > now + MEDIA_PLAYBACK_TTL_MS) return null;
    return claims.viewerId;
  } catch {
    return null;
  }
}
