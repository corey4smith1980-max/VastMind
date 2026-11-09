import { publishableKeyFromHost } from "@clerk/shared/keys";

/**
 * Production uses CLERK_PUBLISHABLE_KEY directly. Host-derived keys are only
 * a fallback for Replit-managed domains when that variable is unset.
 */
export function clerkPublishableKey(host?: string): string | undefined {
  const fromEnv = process.env.CLERK_PUBLISHABLE_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (!host) return undefined;
  const fromHost = publishableKeyFromHost(host, "");
  return fromHost || undefined;
}
