import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { HttpError } from "./lib/social";
import type { ErrorRequestHandler } from "express";

const app: Express = express();

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
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: false }));
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
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
