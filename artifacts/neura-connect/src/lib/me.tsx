"use client";
import { createContext, useContext } from "react";
import type { Profile } from "@workspace/api-client-react";

// Signed-in member profile, provided by the app shell once loaded.
export const MeContext = createContext<Profile | null>(null);
export function useMe() {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe used outside app shell");
  return me;
}
