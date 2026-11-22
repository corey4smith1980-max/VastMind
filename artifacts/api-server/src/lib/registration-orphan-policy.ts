export const FAILED_REGISTRATION_GRACE_MS = 60_000;
export const ORPHAN_REGISTRATION_AGE_MS = 15 * 60_000;

/** A failed passkey signup may be removed so the same username can be tried again. */
export function shouldReleaseRegistration(input: {
  syntheticAccount: boolean;
  hasPasskey: boolean;
  hasSession: boolean;
  intentUsedAt: number | null;
  profileCreatedAt: number | null;
  intentExpiresAt: number;
  now: number;
}): boolean {
  if (!input.syntheticAccount || input.hasPasskey || input.hasSession) return false;
  const usedAndSettled = input.intentUsedAt !== null && input.now - input.intentUsedAt >= FAILED_REGISTRATION_GRACE_MS;
  const profileAged = input.profileCreatedAt !== null && input.now - input.profileCreatedAt >= ORPHAN_REGISTRATION_AGE_MS;
  const intentAged = input.now - input.intentExpiresAt >= ORPHAN_REGISTRATION_AGE_MS;
  return usedAndSettled || profileAged || intentAged;
}
