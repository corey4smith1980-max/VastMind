import { test } from "node:test";
import strict from "node:assert/strict";
import { applyBucketCors, bucketCorsRuleMatches, bucketUploadOrigins, desiredBucketCorsRule, ensureBucketCors } from "./s3-cors";

test("bucket upload origins come from the public site and the CORS allowlist", () => {
  strict.deepEqual(bucketUploadOrigins({
    VASTMIND_AUTH_URL: "https://vastmind.example",
    CORS_ORIGINS: "https://preview.example, https://vastmind.example",
  } as NodeJS.ProcessEnv), [
    "https://preview.example",
    "https://vastmind.example",
  ]);
  strict.throws(() => bucketUploadOrigins({ CORS_ORIGINS: "*" } as NodeJS.ProcessEnv), /must not be \*/);
});

test("bucket CORS is rewritten only when the current rule differs", async () => {
  const desired = desiredBucketCorsRule(["https://vastmind.example"]);
  strict.equal(desired.MaxAgeSeconds, 600);
  strict.deepEqual(desired.AllowedMethods, ["HEAD", "PUT"]);
  strict.deepEqual(desired.AllowedHeaders, ["content-type"]);
  strict.equal(bucketCorsRuleMatches({
    AllowedOrigins: ["https://vastmind.example"],
    AllowedMethods: ["PUT", "HEAD"],
    AllowedHeaders: ["Content-Type"],
    MaxAgeSeconds: 600,
  }, desired), true);

  let writes = 0;
  const unchanged = await applyBucketCors({
    origins: ["https://vastmind.example"],
    getRules: async () => [desired],
    putRules: async () => { writes += 1; },
  });
  strict.equal(unchanged, "unchanged");
  strict.equal(writes, 0);

  const updated = await applyBucketCors({
    origins: ["https://vastmind.example"],
    getRules: async () => [],
    putRules: async (rules) => {
      writes += 1;
      strict.equal(bucketCorsRuleMatches(rules[0], desired), true);
    },
  });
  strict.equal(updated, "updated");
  strict.equal(writes, 1);
});

test("a bucket CORS failure does not throw", async () => {
  const previous = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
    VASTMIND_AUTH_URL: process.env.VASTMIND_AUTH_URL,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
  };
  process.env.S3_ENDPOINT = "http://127.0.0.1:9000";
  process.env.S3_BUCKET = "vastmind";
  process.env.S3_ACCESS_KEY_ID = "access";
  process.env.S3_SECRET_ACCESS_KEY = "secretsecret";
  process.env.S3_FORCE_PATH_STYLE = "true";
  process.env.VASTMIND_AUTH_URL = "https://vastmind.example";
  delete process.env.CORS_ORIGINS;
  try {
    await ensureBucketCors({
      getRules: async () => { throw Object.assign(new Error("denied"), { name: "AccessDenied" }); },
      putRules: async () => { throw new Error("should not write"); },
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
