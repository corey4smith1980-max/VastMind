import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import * as schemas from "@workspace/api-zod";
import { z } from "zod";
import { assert, blocked, provision, query, transaction, type Query, type Row } from "../social";
import { changed } from "../realtime";
import { authenticatedUserId } from "../vastmind-auth";

export type CommerceContext = { u: string; user: Row; p: Record<string, string>; b: any; s: any; q: Query; impact: Set<string> };
export type CommerceRoute = (method: "get" | "post" | "patch" | "put", path: string, operation: string, handler: (c: CommerceContext) => Promise<unknown>, status?: number) => void;
const registry = schemas as unknown as Record<string, z.ZodType>;
function clean(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)]));
  return value;
}
function parse(schema: z.ZodType | undefined, value: unknown) {
  if (!schema) return value ?? {};
  const parsed = schema.safeParse(value);
  assert(parsed.success, 400, "Check the required fields and allowed values");
  return parsed.data;
}

/** Every commerce operation uses the same Clerk identity, CSRF guard and generated contract. */
export function commerceRouter() {
  const router: IRouter = Router();
  router.use("/commerce", async (req, res, next) => {
    const userId = await authenticatedUserId(req);
    assert(userId, 401, "Authentication required");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin && !req.headers.authorization) {
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
      let matches = false;
      try { matches = new URL(req.headers.origin).host === host; } catch { /* Reject malformed origins. */ }
      assert(matches, 403, "Cross-origin request rejected");
    }
    res.locals.user = await provision(userId);
    next();
  });
  const limit = rateLimit({ windowMs: 60_000, limit: 180, keyGenerator: (_req, res) => res.locals.user.id, standardHeaders: "draft-8", legacyHeaders: false });
  const writes = rateLimit({ windowMs: 60_000, limit: 60, keyGenerator: (_req, res) => res.locals.user.id, standardHeaders: "draft-8", legacyHeaders: false });
  const route: CommerceRoute = (method, path, operation, handler, status = 200) => {
    assert(registry[`${operation}Response`], 500, `Missing contract for ${operation}`);
    router[method](path, limit, ...(method === "get" ? [] : [writes]), async (req, res) => {
      const p = parse(registry[`${operation}Params`], req.params) as Record<string, string>;
      for (const value of Object.values(p)) assert(typeof value === "string" && value.length > 0 && value.length < 160, 400, "Invalid identifier");
      const c: CommerceContext = {
        u: res.locals.user.id, user: res.locals.user, p,
        b: parse(registry[`${operation}Body`], req.body), s: parse(registry[`${operation}QueryParams`], req.query),
        q: query, impact: new Set([res.locals.user.id]),
      };
      const run = async (q: Query) => {
        c.q = q;
        return registry[`${operation}Response`].parse(clean(await handler(c)));
      };
      // Row locks and uniqueness constraints protect stock, coupons and retries, rather than a global write lock.
      const data = method === "get" ? await run(query) : await transaction(run);
      if (method !== "get") {
        const recipients: string[] = [];
        for (const id of c.impact) if (id === c.u || !await blocked(id, c.u)) recipients.push(id);
        changed(recipients, "commerce");
      }
      res.status(status).json(data);
    });
  };
  return { router, route };
}
