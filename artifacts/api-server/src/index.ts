import app from "./app";
import { logger } from "./lib/logger";
import { createServer } from "node:http";
import { attachRealtime } from "./lib/realtime";

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
server.on("error",()=>{logger.error("Server failed to listen");process.exit(1);});
server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
