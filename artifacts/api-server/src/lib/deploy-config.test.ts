import { test } from "node:test";
import strict from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { poolConfigFromUrl } from "../../../../lib/db/pg-config.mjs";
import { configuredCorsOrigins, createCorsMiddleware, isAllowedCorsOrigin, parseCorsOrigins, socketOriginAllowed } from "./cors-policy";
import { readS3Config, selectStorageBackend } from "./s3-config";
import { entityIdFromObjectPath, parseObjectPath } from "./storage-types";

test("database SSL follows Railway private and public URLs", () => {
  const internal = poolConfigFromUrl("postgresql://vastmind:secret@postgres.railway.internal:5432/vastmind");
  strict.equal(internal.ssl, false);
  strict.equal(String(internal.connectionString).includes("sslmode"), false);

  const local = poolConfigFromUrl("postgresql://vastmind:secret@127.0.0.1:5432/vastmind");
  strict.equal(local.ssl, false);

  const publicUrl = poolConfigFromUrl("postgresql://vastmind:secret@roundhouse.proxy.rlwy.net:12345/vastmind?sslmode=require");
  strict.deepEqual(publicUrl.ssl, { rejectUnauthorized: true });

  const relaxed = poolConfigFromUrl(
    "postgresql://vastmind:secret@roundhouse.proxy.rlwy.net:12345/vastmind?sslmode=require",
    { DATABASE_SSL_REJECT_UNAUTHORIZED: "false" },
  );
  strict.deepEqual(relaxed.ssl, { rejectUnauthorized: false });

  const disabled = poolConfigFromUrl("postgresql://vastmind:secret@127.0.0.1:5432/vastmind?sslmode=disable");
  strict.equal(disabled.ssl, false);
});

test("CORS allowlist is exact and rejects wildcards", () => {
  strict.throws(() => parseCorsOrigins("*"), /must not be \*/);
  strict.throws(() => parseCorsOrigins("https://good.example, *"), /must not be \*/);
  strict.throws(() => parseCorsOrigins("https://user:pass@good.example"), /without paths/);
  const env = {
    CORS_ORIGINS: "https://mobile.example, https://preview.example",
    VASTMIND_AUTH_URL: "https://vastmind.example",
    REPLIT_EXPO_DEV_DOMAIN: "expo.replit.dev",
  } as NodeJS.ProcessEnv;
  strict.deepEqual(configuredCorsOrigins(env), [
    "https://mobile.example",
    "https://preview.example",
    "https://vastmind.example",
    "https://expo.replit.dev",
  ]);
  strict.equal(isAllowedCorsOrigin("https://vastmind.example", env), true);
  strict.equal(isAllowedCorsOrigin("https://vastmind.example.evil", env), false);
  strict.equal(isAllowedCorsOrigin("https://evil.example", env), false);
  strict.equal(socketOriginAllowed(undefined, "vastmind.example", env), true);
  strict.equal(socketOriginAllowed("https://vastmind.example", "api.internal", env), true);
  strict.equal(socketOriginAllowed("https://evil.example", "vastmind.example", env), false);
  strict.equal(socketOriginAllowed("https://vastmind.example", "vastmind.example", {}), true);
});

test("disallowed browser origins are not reflected", async () => {
  const previous = {
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    VASTMIND_AUTH_URL: process.env.VASTMIND_AUTH_URL,
    REPLIT_EXPO_DEV_DOMAIN: process.env.REPLIT_EXPO_DEV_DOMAIN,
  };
  process.env.CORS_ORIGINS = "https://app.example";
  delete process.env.VASTMIND_AUTH_URL;
  delete process.env.REPLIT_EXPO_DEV_DOMAIN;
  const app = express();
  app.use(createCorsMiddleware());
  app.get("/ping", (_req, res) => { res.json({ ok: true }); });
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const denied = await fetch(`http://127.0.0.1:${port}/ping`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "GET" },
    });
    strict.equal(denied.status, 403);
    strict.equal(denied.headers.get("access-control-allow-origin"), null);
    const allowed = await fetch(`http://127.0.0.1:${port}/ping`, { headers: { origin: "https://app.example" } });
    strict.equal(allowed.status, 200);
    strict.equal(allowed.headers.get("access-control-allow-origin"), "https://app.example");
    strict.equal(allowed.headers.get("access-control-allow-credentials"), "true");
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("S3 config accepts Railway bucket variables and refuses a partial setup", () => {
  const config = readS3Config({
    AWS_ENDPOINT_URL: "https://t3.storageapi.dev",
    BUCKET: "vastmind-media-abc",
    AWS_DEFAULT_REGION: "auto",
    ACCESS_KEY_ID: "access",
    SECRET_ACCESS_KEY: "secret",
    AWS_S3_URL_STYLE: "virtual",
  });
  strict.equal(config.endpoint, "https://t3.storageapi.dev");
  strict.equal(config.bucket, "vastmind-media-abc");
  strict.equal(config.region, "auto");
  strict.equal(config.forcePathStyle, false);
  strict.equal(config.prefix, "media");
  strict.equal(selectStorageBackend({ PRIVATE_OBJECT_DIR: "/replit/media" }), "replit");
  strict.throws(() => selectStorageBackend({ S3_BUCKET: "only-bucket" }), /incomplete/);
  strict.equal(selectStorageBackend({
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_BUCKET: "vastmind",
    S3_ACCESS_KEY_ID: "access",
    S3_SECRET_ACCESS_KEY: "secret",
  }), "s3");
  strict.equal(readS3Config({
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_BUCKET: "vastmind",
    S3_ACCESS_KEY_ID: "access",
    S3_SECRET_ACCESS_KEY: "secret",
  }).forcePathStyle, true);
});

test("presigned uploads sign the declared content type", async () => {
  const { S3ObjectStorage } = await import("./s3-storage");
  const storage = new S3ObjectStorage({
    endpoint: "http://127.0.0.1:9000",
    bucket: "vastmind",
    region: "us-east-1",
    accessKeyId: "access",
    secretAccessKey: "secretsecret",
    forcePathStyle: true,
    prefix: "media",
  });
  const reserved = await storage.reserveUpload({ contentType: "image/png" });
  const url = new URL(reserved.uploadUrl);
  strict.match(reserved.objectPath, /^\/objects\/uploads\/[0-9a-f-]+$/);
  strict.match(url.pathname, /^\/vastmind\/media\/uploads\/[0-9a-f-]+$/);
  strict.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-type;host");
  strict.equal(/checksum/i.test(url.search), false);
});

test("sealed object keys stay inside the private prefix", () => {
  const privateDir = "/vastmind-media-abc/media";
  const objectPath = "/objects/sealed/11111111-1111-1111-1111-111111111111";
  const entityId = entityIdFromObjectPath(objectPath);
  const finalName = `${privateDir.replace(/^\/[^/]+\//, "")}/${entityId}`;
  const parsed = parseObjectPath(`${privateDir}/${entityId}`);
  strict.equal(parsed.bucketName, "vastmind-media-abc");
  strict.equal(parsed.objectName, finalName);
  strict.equal(finalName, "media/sealed/11111111-1111-1111-1111-111111111111");
  strict.throws(() => entityIdFromObjectPath("/objects/../secret"), /not found/i);
});
