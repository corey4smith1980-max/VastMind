import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";

export const TRUSTED_DEVICE_COOKIE = "__Host-vastmind-device";
export const TRUSTED_DEVICE_HEADER = "x-vastmind-device-trust";
export const TRUSTED_DEVICE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export function createTrustedDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashTrustedDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function trustedDeviceTokenFromRequest(req: Request): string | null {
  const nativeToken = req.get(TRUSTED_DEVICE_HEADER);
  if (nativeToken && /^[A-Za-z0-9_-]{43}$/.test(nativeToken)) return nativeToken;
  const cookie = req.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${TRUSTED_DEVICE_COOKIE}=`));
  if (!cookie) return null;
  const value = cookie.slice(TRUSTED_DEVICE_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function setTrustedDeviceCookie(res: Response, token: string): void {
  res.setHeader(
    "Set-Cookie",
    `${TRUSTED_DEVICE_COOKIE}=${token}; Path=/; Max-Age=${Math.floor(TRUSTED_DEVICE_TTL_MS / 1000)}; Secure; HttpOnly; SameSite=Strict`,
  );
}

export function clearTrustedDeviceCookie(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    `${TRUSTED_DEVICE_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`,
  );
}
