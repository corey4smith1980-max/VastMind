"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { basePath } from "./base";

// Same-origin authentication avoids sending passkey ceremonies through a third
// party. Clerk remains a temporary bridge for members who have not migrated.
export const vastMindAuthClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [passkeyClient()],
});

type Identity = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  provider: "vastmind" | "clerk" | null;
  getToken: () => Promise<string | null>;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
};

const Context = createContext<Identity | null>(null);

export function VastMindAuthProvider({ children }: { children: ReactNode }) {
  const legacy = useClerkAuth();
  const clerk = useClerk();
  const session = vastMindAuthClient.useSession();
  const passkeyUserId = session.data?.user.id ?? null;
  const userId = passkeyUserId ?? legacy.userId ?? null;
  const provider = passkeyUserId ? "vastmind" : legacy.isSignedIn ? "clerk" : null;
  const getToken = useCallback(async () => {
    if (passkeyUserId) return null; // Browser requests use the HttpOnly session cookie.
    return legacy.getToken();
  }, [passkeyUserId, legacy.getToken]);
  const signOut = useCallback(async (options?: { redirectUrl?: string }) => {
    const result = await vastMindAuthClient.signOut();
    if (result.error && passkeyUserId) throw new Error("Unable to sign out. Please try again.");
    if (legacy.isSignedIn) {
      await clerk.signOut({ redirectUrl: options?.redirectUrl ?? `${basePath}/` });
    } else {
      window.location.assign(options?.redirectUrl ?? `${basePath}/`);
    }
  }, [clerk, legacy.isSignedIn, passkeyUserId]);
  const value = useMemo<Identity>(() => ({
    isLoaded: !!passkeyUserId || (!session.isPending && legacy.isLoaded),
    isSignedIn: !!userId,
    userId,
    provider,
    getToken,
    signOut,
  }), [passkeyUserId, session.isPending, legacy.isLoaded, userId, provider, getToken, signOut]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth(): Identity {
  const value = useContext(Context);
  if (!value) throw new Error("VastMind authentication provider is missing.");
  return value;
}

/** Auth-related JSON calls deliberately never accept or send a recovery phrase. */
export async function identityCall<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE" | "GET",
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`/api/identity/${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Unable to complete the request. Try again.");
  return data as T;
}

export function identityRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return identityCall<T>(path, "POST", body);
}
