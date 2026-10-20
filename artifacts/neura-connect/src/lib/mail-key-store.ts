import {
  mailIdentityStorageValue,
  parseMailIdentityStorageValue,
  type MailIdentity,
} from "@workspace/mail-crypto";

const DATABASE = "vastmind-mail-device-keys";
const STORE = "identities";
const VERSION = 1;

type StoredIdentity = {
  userId: string;
  deviceKey: CryptoKey;
  iv: number[];
  ciphertext: ArrayBuffer;
};

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) {
    return Promise.reject(new Error("Secure local mail storage is unavailable in this browser."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open secure mail storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Secure mail storage request failed."));
  });
}

/** Browser device storage encrypts private key material with a non-exportable local AES key. */
export async function loadMailIdentity(userId: string): Promise<MailIdentity | null> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readonly");
  const record = await requestResult(transaction.objectStore(STORE).get(userId)) as StoredIdentity | undefined;
  db.close();
  if (!record) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(record.iv) },
      record.deviceKey,
      record.ciphertext,
    );
    return parseMailIdentityStorageValue(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error("Stored mail keys could not be unlocked. Restore them with your recovery phrase.");
  }
}

export async function saveMailIdentity(userId: string, identity: MailIdentity): Promise<void> {
  const db = await openDatabase();
  const existing = await requestResult(db.transaction(STORE, "readonly").objectStore(STORE).get(userId)) as StoredIdentity | undefined;
  const deviceKey = existing?.deviceKey ?? await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    deviceKey,
    new TextEncoder().encode(mailIdentityStorageValue(identity)),
  );
  const transaction = db.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).put({
    userId,
    deviceKey,
    iv: Array.from(iv),
    ciphertext,
  } satisfies StoredIdentity);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save mail keys on this device."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Saving mail keys was interrupted."));
  });
  db.close();
}

export async function clearMailIdentity(userId: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).delete(userId);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove local mail keys."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Removing local mail keys was interrupted."));
  });
  db.close();
}
