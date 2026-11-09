const http = require("node:http");
const test = require("node:test");
const strict = require("node:assert/strict");
const { createGateway, routeTarget } = require("./server");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function origin(port) {
  return `http://127.0.0.1:${port}`;
}

test("routes keep the API, web app, and mobile install page on one origin", () => {
  strict.equal(routeTarget("/healthz"), "health");
  strict.equal(routeTarget("/api/healthz"), "api");
  strict.equal(routeTarget("/api/socket.io/"), "api");
  strict.equal(routeTarget("/mobile/"), "mobile");
  strict.equal(routeTarget("/feed/"), "web");
});

test("gateway proxies each prefix and answers its own health check", async () => {
  const seen = [];
  const upstream = (label) => http.createServer((req, res) => {
    seen.push(`${label} ${req.url?.split("?")[0]} ${req.headers["x-forwarded-host"]} ${req.headers["x-forwarded-proto"]}`);
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(label);
  });
  const api = upstream("api");
  const web = upstream("web");
  const mobile = upstream("mobile");
  const apiPort = await listen(api);
  const webPort = await listen(web);
  const mobilePort = await listen(mobile);
  const gateway = createGateway({
    apiUpstream: origin(apiPort),
    webUpstream: origin(webPort),
    mobileUpstream: origin(mobilePort),
  });
  const port = await listen(gateway);
  const base = origin(port);

  const health = await fetch(`${base}/healthz`);
  strict.equal(health.status, 200);
  strict.equal((await health.json()).status, "ok");

  const apiResponse = await fetch(`${base}/api/healthz`, { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "vastmind.example" } });
  strict.equal(await apiResponse.text(), "api");
  const page = await fetch(`${base}/feed/`, { headers: { "x-forwarded-host": "vastmind.example" } });
  strict.equal(await page.text(), "web");
  const install = await fetch(`${base}/mobile/`, { headers: { "x-forwarded-host": "vastmind.example" } });
  strict.equal(await install.text(), "mobile");

  strict.deepEqual(seen, [
    "api /api/healthz vastmind.example https",
    "web /feed/ vastmind.example http",
    "mobile /mobile/ vastmind.example http",
  ]);

  await new Promise((resolve) => gateway.close(resolve));
  await Promise.all([api, web, mobile].map((server) => new Promise((resolve) => server.close(resolve))));
});
