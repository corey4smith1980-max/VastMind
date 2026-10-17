// Base path helpers shared by Clerk wiring and links outside Next's router.
export const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

// Clerk passes full paths to routerPush/routerReplace, but Next's router
// prepends basePath — strip it to avoid doubling.
export function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}
