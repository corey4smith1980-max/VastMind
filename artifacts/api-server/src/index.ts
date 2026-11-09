import app from "./app";
import { logger } from "./lib/logger";
import { selectStorageBackend } from "./lib/s3-config";
import { createServer } from "node:http";
import { attachRealtime } from "./lib/realtime";
import { cleanExpiredMedia } from "./routes/media";
import { deliverPush } from "./lib/push";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server=createServer(app);
attachRealtime(server);
const host = process.env.LISTEN_HOST || "::";
server.on("error",()=>{logger.error("Server failed to listen");process.exit(1);});
server.listen({ port, host }, () => {
  logger.info({ port, storage: selectStorageBackend() }, "Server listening");
  const cleanup=()=>cleanExpiredMedia().catch(()=>logger.warn("Media cleanup unavailable"));
  void cleanup();
  setInterval(cleanup,60*60_000).unref();
  setInterval(()=>deliverPush().catch(()=>logger.warn("Push worker unavailable")),5_000).unref();
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
