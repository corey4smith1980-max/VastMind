import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRecoveryPhrase,
  accountRecoveryPublicKey,
  signAccountRecoveryChallenge,
  verifyAccountRecoveryChallenge,
  deriveMailIdentity,
  clearMailIdentityMemory,
} from "@workspace/mail-crypto";

test("recovery proof authenticates only the enrolled phrase and exact challenge", async () => {
  const phrase = createRecoveryPhrase();
  const publicKey = await accountRecoveryPublicKey(phrase);
  const proof = await signAccountRecoveryChallenge(phrase, "one-time-challenge");
  assert.equal(proof.publicKey, publicKey);
  assert.equal(verifyAccountRecoveryChallenge(publicKey, "one-time-challenge", proof.signature), true);
  assert.equal(verifyAccountRecoveryChallenge(publicKey, "different-challenge", proof.signature), false);
  const other = await accountRecoveryPublicKey(createRecoveryPhrase());
  assert.equal(verifyAccountRecoveryChallenge(other, "one-time-challenge", proof.signature), false);
  assert.equal(verifyAccountRecoveryChallenge(publicKey, "one-time-challenge", "bad"), false);
});

test("account recovery is domain-separated from encrypted mail signing keys", async () => {
  const phrase = createRecoveryPhrase();
  const identity = await deriveMailIdentity(phrase);
  const publicKey = await accountRecoveryPublicKey(phrase);
  assert.notEqual(publicKey, identity.signingPublicKey);
  clearMailIdentityMemory(identity);
  await assert.rejects(() => accountRecoveryPublicKey("not a phrase"));
});
