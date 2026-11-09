const http = require("node:http");
const httpProxy = require("http-proxy");

function routeTarget(pathname) {
  if (pathname === "/healthz" || pathname === "/healthz/") return "health";
  if (pathname === "/api" || pathname.startsWith("/api/")) return "api";
  if (pathname === "/mobile" || pathname.startsWith("/mobile/")) return "mobile";
  return "web";
}

function headerValue(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function publicHost(req) {
  return (headerValue(req.headers["x-forwarded-host"]) || headerValue(req.headers.host)).split(",")[0].trim();
}

function publicProto(req) {
  const forwarded = headerValue(req.headers["x-forwarded-proto"]).split(",")[0].trim().toLowerCase();
  if (forwarded === "http" || forwarded === "https") return forwarded;
  return req.socket?.encrypted ? "https" : "http";
}

function forwardHeaders(req) {
  const host = publicHost(req);
  const existing = headerValue(req.headers["x-forwarded-for"]);
  const remote = req.socket?.remoteAddress || "";
  return {
    host,
    "x-forwarded-host": host,
    "x-forwarded-proto": publicProto(req),
    "x-forwarded-for": existing ? `${existing}, ${remote}` : remote,
  };
}

function requireUpstream(name, value) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} must be set to an absolute http(s) URL.`);
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must be an absolute http(s) URL.`);
  }
  return trimmed.replace(/\/$/, "");
}

function createGateway({ apiUpstream, webUpstream, mobileUpstream }) {
  const api = requireUpstream("API_UPSTREAM", apiUpstream);
  const web = requireUpstream("WEB_UPSTREAM", webUpstream);
  const mobile = mobileUpstream ? requireUpstream("MOBILE_UPSTREAM", mobileUpstream) : "";
  const proxy = httpProxy.createProxyServer({ proxyTimeout: 0, timeout: 0, xfwd: false, changeOrigin: false });
  proxy.on("error", (_error, _req, res) => {
    if (res && typeof res.writeHead === "function" && !res.headersSent) {
      res.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "Upstream unavailable" }));
      return;
    }
    if (res && typeof res.destroy === "function") res.destroy();
  });

  const server = http.createServer((req, res) => {
    const pathname = (req.url || "/").split("?")[0];
    const target = routeTarget(pathname);
    if (target === "health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (target === "mobile" && !mobile) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "Mobile install page is not configured" }));
      return;
    }
    const upstream = target === "api" ? api : target === "mobile" ? mobile : web;
    proxy.web(req, res, { target: upstream, headers: forwardHeaders(req) });
  });

  server.on("upgrade", (req, socket, head) => {
    const pathname = (req.url || "/").split("?")[0];
    if (routeTarget(pathname) !== "api") {
      socket.destroy();
      return;
    }
    proxy.ws(req, socket, head, { target: api, headers: forwardHeaders(req) });
  });

  return server;
}

function listen(server) {
  const rawPort = process.env.PORT;
  if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);
  const host = process.env.LISTEN_HOST || "::";
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ port, host }, () => resolve(server));
  });
}

if (require.main === module) {
  const server = createGateway({
    apiUpstream: process.env.API_UPSTREAM,
    webUpstream: process.env.WEB_UPSTREAM,
    mobileUpstream: process.env.MOBILE_UPSTREAM,
  });
  listen(server).catch((error) => {
    process.stderr.write(`${JSON.stringify({ event: "gateway_failed", code: error.code || "listen_failed" })}\n`);
    process.exit(1);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
}

module.exports = { createGateway, routeTarget, listen };
