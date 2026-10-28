import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
  clearTrustedDeviceCookie,
  createTrustedDeviceToken,
  hashTrustedDeviceToken,
  setTrustedDeviceCookie,
  trustedDeviceTokenFromRequest,
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_HEADER,
} from "./trusted-device";

test("trusted-device credentials are random URL-safe values stored as one-way hashes", () => {
  const first = createTrustedDeviceToken();
  const second = createTrustedDeviceToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(second, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.match(hashTrustedDeviceToken(first), /^[0-9a-f]{64}$/);
  assert.equal(hashTrustedDeviceToken(first), hashTrustedDeviceToken(first));
  assert.notEqual(hashTrustedDeviceToken(first), first);
});

test("trusted-device credentials accept only correctly shaped native headers and web cookies", () => {
  const token = createTrustedDeviceToken();
  const request = (header: string | undefined, cookie: string | undefined) => ({
    get: (name: string) => name.toLowerCase() === TRUSTED_DEVICE_HEADER ? header : undefined,
    headers: cookie ? { cookie } : {},
  }) as unknown as Request;

  assert.equal(trustedDeviceTokenFromRequest(request(token, undefined)), token);
  assert.equal(trustedDeviceTokenFromRequest(request(undefined, `${TRUSTED_DEVICE_COOKIE}=${token}; theme=dark`)), token);
  assert.equal(trustedDeviceTokenFromRequest(request("not-a-token", undefined)), null);
  assert.equal(trustedDeviceTokenFromRequest(request(undefined, `${TRUSTED_DEVICE_COOKIE}=bad`)), null);
});

test("web trust cookies are host-only, secure, HTTP-only, strict, and revocable", () => {
  let cookie = "";
  const response = { setHeader: (_name: string, value: string) => { cookie = value; } } as unknown as Response;
  const token = createTrustedDeviceToken();

  setTrustedDeviceCookie(response, token);
  assert.equal(cookie.split(";")[0], `${TRUSTED_DEVICE_COOKIE}=${token}`);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=31536000/);

  clearTrustedDeviceCookie(response);
  assert.match(cookie, /Max-Age=0/);
});
