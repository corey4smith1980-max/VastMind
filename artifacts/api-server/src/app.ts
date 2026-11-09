import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { HttpError } from "./lib/social";
import type { ErrorRequestHandler } from "express";
import { toNodeHandler } from "better-auth/node";
import { vastMindAuth } from "./lib/vastmind-auth";
import { clerkPublishableKey } from "./lib/clerk-key";
import { configuredCorsOrigins, createCorsMiddleware } from "./lib/cors-policy";

const app: Express = express();

// Replit serves this API through one trusted reverse proxy. Respect its
// forwarded client address so IP-based rate limits work without trusting
// arbitrary proxy chains supplied by callers.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Probes stay in front of auth. Deployment checks must not depend on Clerk.
configuredCorsOrigins();
app.use("/api", healthRouter);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
// Credentialed browsers only. Listed origins are reflected; never "*".
app.use(createCorsMiddleware());
// Better Auth consumes the raw request stream for passkey/WebAuthn endpoints.
// The raw email/password endpoint is intentionally not exposed: usernames are
// resolved server-side and password sign-in is checked against device trust.
app.all("/api/auth/sign-in/email", (_req, res) => {
  res.status(403).json({ error: "Use VastMind username sign-in on a trusted device." });
});
// Mount the remaining handlers before Express body parsing and keep Clerk available for migration.
app.all("/api/auth/*splat", toNodeHandler(vastMindAuth));
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: clerkPublishableKey(getClerkProxyHost(req)),
    secretKey: process.env.CLERK_SECRET_KEY,
  })),
);

app.use("/api", router);
const errors: ErrorRequestHandler = (err, req, res, _next) => {
  if(err instanceof HttpError){res.status(err.status).json({error:err.message});return;}
  if(err?.code==="23505"){res.status(409).json({error:"That username or resource already exists"});return;}
  if(err?.type==="entity.too.large"){res.status(413).json({error:"Request body too large"});return;}
  if(err instanceof SyntaxError || err?.code==="22P02" || err?.code==="22007"){res.status(400).json({error:"Invalid request"});return;}
  req.log.error({errorType:err?.name??"Error",code:err?.code},"Request failed");
  res.status(500).json({error:"Unable to complete the request"});
};
app.use(errors);

export default app;
