import assert from "node:assert/strict";
import test from "node:test";
import { issueMediaPlaybackTicket, MEDIA_PLAYBACK_TTL_MS, verifyMediaPlaybackTicket } from "./media-playback";

const secret = "test-only-media-playback-secret-for-unit-tests";
const mediaId = "d824e54e-a2f5-45d2-ae6b-ce1b13494d77";
const viewerId = "ad57e280-24d4-4b2b-9688-6c82af96c6e1";

test("private playback tickets are scoped to their viewer and media, then expire", () => {
  const now = 1_800_000_000_000;
  const { token, expiresAt } = issueMediaPlaybackTicket(mediaId, viewerId, secret, now);
  assert.equal(expiresAt, now + MEDIA_PLAYBACK_TTL_MS);
  assert.equal(verifyMediaPlaybackTicket(token, mediaId, secret, now), viewerId);
  assert.equal(verifyMediaPlaybackTicket(token, "another-media-id", secret, now), null);
  assert.equal(verifyMediaPlaybackTicket(token, mediaId, "a-different-secret-for-testing", now), null);
  assert.equal(verifyMediaPlaybackTicket(token, mediaId, secret, expiresAt), null);
});

test("private playback tickets reject malformed or modified values", () => {
  const { token } = issueMediaPlaybackTicket(mediaId, viewerId, secret, 1_800_000_000_000);
  assert.equal(verifyMediaPlaybackTicket(null, mediaId, secret), null);
  assert.equal(verifyMediaPlaybackTicket("not.a.valid.ticket", mediaId, secret), null);
  const [payload, signature] = token.split(".");
  const replacement = signature[0] === "A" ? "B" : "A";
  assert.equal(verifyMediaPlaybackTicket(`${payload}.${replacement}${signature.slice(1)}`, mediaId, secret, 1_800_000_000_000), null);
  assert.equal(verifyMediaPlaybackTicket("x".repeat(2049), mediaId, secret), null);
});
