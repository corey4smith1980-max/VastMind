import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import {
  createRecoveryPhrase,
  decryptMailEnvelope,
  deriveMailIdentity,
  encryptMailForRecipient,
  verifyMailEnvelopeSignature,
} from "../src/index";

if (!globalThis.crypto?.getRandomValues) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

test("a recovery phrase restores identity and signed envelopes decrypt only for their recipient", async () => {
  const senderPhrase = createRecoveryPhrase();
  const recipientPhrase = createRecoveryPhrase();
  const sender = await deriveMailIdentity(senderPhrase);
  const restoredSender = await deriveMailIdentity(senderPhrase);
  const recipient = await deriveMailIdentity(recipientPhrase);
  const message = { subject: "A private note", body: "Hello from VastMind 🌐" };

  assert.equal(restoredSender.encryptionPublicKey, sender.encryptionPublicKey);
  assert.equal(restoredSender.signingPublicKey, sender.signingPublicKey);

  const envelope = await encryptMailForRecipient({
    identity: sender,
    threadId: "thread-1",
    senderId: "sender-1",
    recipientId: "recipient-1",
    recipientEncryptionPublicKey: recipient.encryptionPublicKey,
    cleartext: message,
  });

  assert.equal(verifyMailEnvelopeSignature({
    threadId: "thread-1",
    senderId: "sender-1",
    recipientId: "recipient-1",
    senderSigningPublicKey: sender.signingPublicKey,
    ...envelope,
  }), true);

  assert.deepEqual(await decryptMailEnvelope({
    identity: recipient,
    threadId: "thread-1",
    senderId: "sender-1",
    recipientId: "recipient-1",
    senderSigningPublicKey: sender.signingPublicKey,
    envelope,
  }), message);

  await assert.rejects(() => decryptMailEnvelope({
    identity: sender,
    threadId: "thread-1",
    senderId: "sender-1",
    recipientId: "recipient-1",
    senderSigningPublicKey: sender.signingPublicKey,
    envelope,
  }));
  assert.equal(verifyMailEnvelopeSignature({
    threadId: "other-thread",
    senderId: "sender-1",
    recipientId: "recipient-1",
    senderSigningPublicKey: sender.signingPublicKey,
    ...envelope,
  }), false);
});
