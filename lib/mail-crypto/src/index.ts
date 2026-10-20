import * as HPKE from "hpke";
import { AEAD_ChaCha20Poly1305, KEM_DHKEM_X25519_HKDF_SHA256 } from "@panva/hpke-noble";
import { ed25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const suite = new HPKE.CipherSuite(
  KEM_DHKEM_X25519_HKDF_SHA256,
  HPKE.KDF_HKDF_SHA256,
  AEAD_ChaCha20Poly1305,
);
const INFO = utf8ToBytes("vastmind-internal-mail-v1");
const ENCRYPTION_DERIVATION = utf8ToBytes("vastmind-mail-hpke-x25519-v1");
const SIGNING_DERIVATION = utf8ToBytes("vastmind-mail-ed25519-v1");
const ACCOUNT_RECOVERY_DERIVATION = utf8ToBytes("vastmind-account-recovery-ed25519-v1");

export type MailCleartext = { subject: string; body: string };
export type MailPublicKeys = { encryptionPublicKey: string; signingPublicKey: string };
export type MailIdentity = MailPublicKeys & {
  encryptionPrivateKey: Uint8Array;
  signingPrivateKey: Uint8Array;
};
export type MailEnvelope = {
  recipientId: string;
  encapsulatedSecret: string;
  ciphertext: string;
  signature: string;
};

/** Create a 24-word BIP39 phrase. The phrase is never sent to the server. */
export function createRecoveryPhrase(): string {
  return generateMnemonic(wordlist, 256);
}

/** A separate key domain proves account recovery without ever sending the phrase to the server. */
export async function accountRecoveryPublicKey(recoveryPhrase: string): Promise<string> {
  const mnemonic = recoveryPhrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!validateMnemonic(mnemonic, wordlist)) throw new Error("Enter a valid recovery phrase.");
  const seed = new Uint8Array(await mnemonicToSeed(mnemonic));
  const signingKey = hkdf(sha256, seed, new Uint8Array(), ACCOUNT_RECOVERY_DERIVATION, 32);
  seed.fill(0);
  try {
    return bytesToHex(ed25519.getPublicKey(signingKey));
  } finally {
    signingKey.fill(0);
  }
}

/** Sign a one-time server challenge locally; the secret phrase remains on the device. */
export async function signAccountRecoveryChallenge(
  recoveryPhrase: string,
  challenge: string,
): Promise<{ publicKey: string; signature: string }> {
  const mnemonic = recoveryPhrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!validateMnemonic(mnemonic, wordlist)) throw new Error("Enter a valid recovery phrase.");
  if (!challenge || challenge.length > 256) throw new Error("Recovery challenge is invalid.");
  const seed = new Uint8Array(await mnemonicToSeed(mnemonic));
  const signingKey = hkdf(sha256, seed, new Uint8Array(), ACCOUNT_RECOVERY_DERIVATION, 32);
  seed.fill(0);
  try {
    const message = utf8ToBytes(`vastmind-account-recovery-v1:${challenge}`);
    return {
      publicKey: bytesToHex(ed25519.getPublicKey(signingKey)),
      signature: bytesToHex(ed25519.sign(message, signingKey)),
    };
  } finally {
    signingKey.fill(0);
  }
}

/** Validate a recovery proof using only the public key stored for the account. */
export function verifyAccountRecoveryChallenge(
  publicKey: string,
  challenge: string,
  signature: string,
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(publicKey) || !/^[0-9a-f]{128}$/i.test(signature) || !challenge || challenge.length > 256) {
    return false;
  }
  try {
    return ed25519.verify(
      hexToBytes(signature),
      utf8ToBytes(`vastmind-account-recovery-v1:${challenge}`),
      hexToBytes(publicKey),
    );
  } catch {
    return false;
  }
}

/** Derive deterministic mail keys so a user-held BIP39 phrase can restore them on another device. */
export async function deriveMailIdentity(recoveryPhrase: string): Promise<MailIdentity> {
  const mnemonic = recoveryPhrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!validateMnemonic(mnemonic, wordlist)) throw new Error("Enter a valid 12, 15, 18, 21, or 24-word recovery phrase.");

  const seed = new Uint8Array(await mnemonicToSeed(mnemonic));
  const encryptionIkm = hkdf(sha256, seed, new Uint8Array(), ENCRYPTION_DERIVATION, 32);
  const signingPrivateKey = hkdf(sha256, seed, new Uint8Array(), SIGNING_DERIVATION, 32);
  seed.fill(0);
  try {
    const pair = await suite.DeriveKeyPair(encryptionIkm, true);
    const [encryptionPrivateKey, encryptionPublicKey] = await Promise.all([
      suite.SerializePrivateKey(pair.privateKey),
      suite.SerializePublicKey(pair.publicKey),
    ]);
    return {
      encryptionPrivateKey: new Uint8Array(encryptionPrivateKey),
      signingPrivateKey,
      encryptionPublicKey: bytesToHex(encryptionPublicKey),
      signingPublicKey: bytesToHex(ed25519.getPublicKey(signingPrivateKey)),
    };
  } finally {
    encryptionIkm.fill(0);
  }
}

/** A short public fingerprint can be compared with a contact out of band. */
export function getMailKeyFingerprint(keys: MailPublicKeys): string {
  return bytesToHex(sha256(concatBytes(
    hexToBytes(keys.encryptionPublicKey),
    hexToBytes(keys.signingPublicKey),
  ))).match(/.{1,4}/g)?.join(" ") ?? "";
}

function associatedData(threadId: string, senderId: string, recipientId: string): Uint8Array {
  return utf8ToBytes(JSON.stringify(["vastmind-mail-v1", threadId, senderId, recipientId]));
}

function signedEnvelopeBytes(
  threadId: string,
  senderId: string,
  recipientId: string,
  encapsulatedSecret: string,
  ciphertext: string,
): Uint8Array {
  return utf8ToBytes(JSON.stringify([
    "vastmind-mail-signature-v1",
    threadId,
    senderId,
    recipientId,
    encapsulatedSecret,
    ciphertext,
  ]));
}

/** Encrypt one copy for a single participant and sign the exact stored envelope. */
export async function encryptMailForRecipient(args: {
  identity: MailIdentity;
  threadId: string;
  senderId: string;
  recipientId: string;
  recipientEncryptionPublicKey: string;
  cleartext: MailCleartext;
}): Promise<MailEnvelope> {
  const recipientKey = await suite.DeserializePublicKey(hexToBytes(args.recipientEncryptionPublicKey));
  const payload = utf8ToBytes(JSON.stringify(args.cleartext));
  const { encapsulatedSecret, ciphertext } = await suite.Seal(recipientKey, payload, {
    info: INFO,
    aad: associatedData(args.threadId, args.senderId, args.recipientId),
  });
  payload.fill(0);
  const encapsulatedSecretHex = bytesToHex(encapsulatedSecret);
  const ciphertextHex = bytesToHex(ciphertext);
  const signature = ed25519.sign(
    signedEnvelopeBytes(args.threadId, args.senderId, args.recipientId, encapsulatedSecretHex, ciphertextHex),
    args.identity.signingPrivateKey,
  );
  return {
    recipientId: args.recipientId,
    encapsulatedSecret: encapsulatedSecretHex,
    ciphertext: ciphertextHex,
    signature: bytesToHex(signature),
  };
}

/** Verify sender authenticity before decrypting. Never render a failed envelope as trusted content. */
export async function decryptMailEnvelope(args: {
  identity: MailIdentity;
  threadId: string;
  senderId: string;
  recipientId: string;
  senderSigningPublicKey: string;
  envelope: Omit<MailEnvelope, "recipientId">;
}): Promise<MailCleartext> {
  const signed = signedEnvelopeBytes(
    args.threadId,
    args.senderId,
    args.recipientId,
    args.envelope.encapsulatedSecret,
    args.envelope.ciphertext,
  );
  const signatureIsValid = ed25519.verify(
    hexToBytes(args.envelope.signature),
    signed,
    hexToBytes(args.senderSigningPublicKey),
  );
  if (!signatureIsValid) throw new Error("This message failed its sender verification check.");

  const privateKey = await suite.DeserializePrivateKey(args.identity.encryptionPrivateKey, true);
  const plaintext = await suite.Open(
    privateKey,
    hexToBytes(args.envelope.encapsulatedSecret),
    hexToBytes(args.envelope.ciphertext),
    { info: INFO, aad: associatedData(args.threadId, args.senderId, args.recipientId) },
  );
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)) as Partial<MailCleartext>;
  plaintext.fill(0);
  if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
    throw new Error("The decrypted message has an unsupported format.");
  }
  return { subject: parsed.subject, body: parsed.body };
}

export function verifyMailEnvelopeSignature(args: {
  threadId: string;
  senderId: string;
  recipientId: string;
  senderSigningPublicKey: string;
  encapsulatedSecret: string;
  ciphertext: string;
  signature: string;
}): boolean {
  try {
    return ed25519.verify(
      hexToBytes(args.signature),
      signedEnvelopeBytes(args.threadId, args.senderId, args.recipientId, args.encapsulatedSecret, args.ciphertext),
      hexToBytes(args.senderSigningPublicKey),
    );
  } catch {
    return false;
  }
}

/** Remove a local copy of key material from a mutable buffer after it is persisted or discarded. */
export function clearMailIdentityMemory(identity: MailIdentity): void {
  identity.encryptionPrivateKey.fill(0);
  identity.signingPrivateKey.fill(0);
}

export function mailIdentityStorageValue(identity: MailIdentity): string {
  return JSON.stringify({
    encryptionPrivateKey: bytesToHex(identity.encryptionPrivateKey),
    signingPrivateKey: bytesToHex(identity.signingPrivateKey),
    encryptionPublicKey: identity.encryptionPublicKey,
    signingPublicKey: identity.signingPublicKey,
  });
}

export function parseMailIdentityStorageValue(value: string): MailIdentity {
  const parsed = JSON.parse(value) as Partial<Record<keyof MailIdentity, string>>;
  if (
    typeof parsed.encryptionPrivateKey !== "string" ||
    typeof parsed.signingPrivateKey !== "string" ||
    typeof parsed.encryptionPublicKey !== "string" ||
    typeof parsed.signingPublicKey !== "string"
  ) throw new Error("Stored mail keys are incomplete.");

  const identity: MailIdentity = {
    encryptionPrivateKey: hexToBytes(parsed.encryptionPrivateKey),
    signingPrivateKey: hexToBytes(parsed.signingPrivateKey),
    encryptionPublicKey: parsed.encryptionPublicKey,
    signingPublicKey: parsed.signingPublicKey,
  };
  const expectedSigningKey = bytesToHex(ed25519.getPublicKey(identity.signingPrivateKey));
  if (expectedSigningKey !== identity.signingPublicKey) {
    clearMailIdentityMemory(identity);
    throw new Error("Stored mail keys did not pass verification.");
  }
  return identity;
}
