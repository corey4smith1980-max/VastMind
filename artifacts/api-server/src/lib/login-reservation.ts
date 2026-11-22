import { randomUUID } from "node:crypto";

/** Better Auth's session before-hook runs before the adapter assigns an id. */
export function ensureSessionId<T extends { id?: string | null }>(session: T): Omit<T, "id"> & { id: string } {
  if (typeof session.id === "string" && session.id.length > 0) return { ...session, id: session.id };
  return { ...session, id: randomUUID() };
}
