import assert from "node:assert/strict";
import test from "node:test";
import { shouldReleasePreFixPasskeyAccount, shouldReleaseRegistration } from "./registration-orphan-policy";

const now = Date.parse("2026-11-22T19:50:00.000Z");

test("a failed passkey registration can be retried once its orphan profile is released", () => {
  const vastmind1 = shouldReleaseRegistration({
    syntheticAccount: true,
    hasPasskey: false,
    hasSession: false,
    intentUsedAt: now - 2 * 60_000,
    profileCreatedAt: now - 2 * 60_000,
    intentExpiresAt: now + 8 * 60_000,
    now,
  });
  assert.equal(vastmind1, true);
});

test("an in-flight registration and a finished account are kept", () => {
  assert.equal(shouldReleaseRegistration({
    syntheticAccount: true,
    hasPasskey: false,
    hasSession: false,
    intentUsedAt: now - 5_000,
    profileCreatedAt: now - 5_000,
    intentExpiresAt: now + 10 * 60_000,
    now,
  }), false);
  assert.equal(shouldReleaseRegistration({
    syntheticAccount: true,
    hasPasskey: true,
    hasSession: true,
    intentUsedAt: now - 60 * 60_000,
    profileCreatedAt: now - 60 * 60_000,
    intentExpiresAt: now - 60 * 60_000,
    now,
  }), false);
  assert.equal(shouldReleaseRegistration({
    syntheticAccount: false,
    hasPasskey: false,
    hasSession: false,
    intentUsedAt: now - 60 * 60_000,
    profileCreatedAt: now - 60 * 60_000,
    intentExpiresAt: now - 60 * 60_000,
    now,
  }), false);
});

test("vastmind1 is released because its passkey was saved and it never had a session", () => {
  const createdAt = Date.parse("2026-11-22T19:46:45.000Z");
  assert.equal(shouldReleasePreFixPasskeyAccount({
    syntheticAccount: true,
    hasPasskey: true,
    hasSession: false,
    intentUsed: true,
    createdAt,
  }), true);
  assert.equal(shouldReleasePreFixPasskeyAccount({
    syntheticAccount: true,
    hasPasskey: true,
    hasSession: true,
    intentUsed: true,
    createdAt,
  }), false);
  assert.equal(shouldReleasePreFixPasskeyAccount({
    syntheticAccount: true,
    hasPasskey: true,
    hasSession: false,
    intentUsed: true,
    createdAt: Date.parse("2026-11-22T20:00:00.000Z"),
  }), false);
  assert.equal(shouldReleasePreFixPasskeyAccount({
    syntheticAccount: true,
    hasPasskey: false,
    hasSession: false,
    intentUsed: true,
    createdAt,
  }), false);
});

test("an unused registration older than 15 minutes is released", () => {
  assert.equal(shouldReleaseRegistration({
    syntheticAccount: true,
    hasPasskey: false,
    hasSession: false,
    intentUsedAt: null,
    profileCreatedAt: now - 16 * 60_000,
    intentExpiresAt: now + 60_000,
    now,
  }), true);
});
