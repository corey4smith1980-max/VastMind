import * as SecureStore from "expo-secure-store";
import {
  mailIdentityStorageValue,
  parseMailIdentityStorageValue,
  type MailIdentity,
} from "@workspace/mail-crypto";

const keyFor = (userId: string) => `vastmind.mail.identity.v1.${userId}`;

/** Native private keys are stored only in the operating system's secure key-value store. */
export async function loadMailIdentity(userId: string): Promise<MailIdentity | null> {
  const value = await SecureStore.getItemAsync(keyFor(userId));
  return value ? parseMailIdentityStorageValue(value) : null;
}

export async function saveMailIdentity(userId: string, identity: MailIdentity): Promise<void> {
  await SecureStore.setItemAsync(keyFor(userId), mailIdentityStorageValue(identity), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearMailIdentity(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(userId));
}
