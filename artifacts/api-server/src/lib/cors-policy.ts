/** Exact browser origins allowed to call the API from another site. */
export function parseCorsOrigins(raw: string | undefined, extras: Array<string | undefined> = []): string[] {
  const origins = new Set<string>();
  const add = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    if (trimmed === "*") throw new Error("CORS_ORIGINS must list exact origins and must not be *.");
    let url: URL;
    try {
      url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    } catch {
      throw new Error("An allowed origin is invalid. Check CORS_ORIGINS and VASTMIND_AUTH_URL.");
    }
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
      throw new Error("CORS_ORIGINS entries must be origins without paths, queries, or credentials.");
    }
    origins.add(url.origin);
  };
  for (const part of (raw ?? "").split(",")) add(part);
  for (const extra of extras) add(extra);
  return [...origins];
}

export function configuredCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const auth = env.VASTMIND_AUTH_URL?.trim();
  const expo = env.REPLIT_EXPO_DEV_DOMAIN?.trim().replace(/^https?:\/\//, "").split("/")[0];
  return parseCorsOrigins(env.CORS_ORIGINS, [
    auth,
    expo ? `https://${expo}` : undefined,
  ]);
}

export function isAllowedCorsOrigin(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return false;
  return configuredCorsOrigins(env).includes(origin);
}

import cors from "cors";
import type { RequestHandler } from "express";

/**
 * Reflect only an allowlisted Origin. A missing Origin is a native client or
 * a same-origin navigation and is not given a wildcard. A browser origin that
 * is not listed gets no allow-origin header; its preflight ends with 403 so
 * the rest of the app does not turn that into a 500.
 */
export function createCorsMiddleware(): RequestHandler {
  const delegated = cors({
    credentials: true,
    origin(origin, callback) {
      callback(null, !origin || isAllowedCorsOrigin(origin));
    },
    allowedHeaders: ["Authorization", "Content-Type", "X-VastMind-Client", "X-VastMind-Device-Trust"],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    maxAge: 600,
  });
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && origin.length > 0 && !isAllowedCorsOrigin(origin)) {
      if (req.method === "OPTIONS") {
        res.status(403).json({ error: "Origin not allowed" });
        return;
      }
      next();
      return;
    }
    delegated(req, res, next);
  };
}

/** Socket.IO handshake headers. Same-host requests are also admitted in allowRequest. */
export function socketCorsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  callback(null, !origin || isAllowedCorsOrigin(origin));
}

export function socketOriginAllowed(origin: string | undefined, host: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return true;
  if (isAllowedCorsOrigin(origin, env)) return true;
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}
