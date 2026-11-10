import type { CORSRule } from "@aws-sdk/client-s3";
import { logger } from "./logger";
import { parseCorsOrigins } from "./cors-policy";
import { readS3Config, selectStorageBackend, type S3Config } from "./s3-config";

export interface BucketCorsRule {
  AllowedOrigins?: string[];
  AllowedMethods?: string[];
  AllowedHeaders?: string[];
  MaxAgeSeconds?: number;
}

export interface BucketCorsIo {
  getRules: () => Promise<BucketCorsRule[]>;
  putRules: (rules: BucketCorsRule[]) => Promise<void>;
}

/** Browser upload origins: the public site plus any extra CORS_ORIGINS entries. */
export function bucketUploadOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseCorsOrigins(env.CORS_ORIGINS, [env.VASTMIND_AUTH_URL]);
}

export function desiredBucketCorsRule(origins: string[]): BucketCorsRule {
  return {
    AllowedOrigins: [...origins].sort(),
    AllowedMethods: ["HEAD", "PUT"],
    AllowedHeaders: ["content-type"],
    MaxAgeSeconds: 600,
  };
}

function sorted(values: string[] | undefined, map: (value: string) => string = (value) => value): string[] {
  return [...(values ?? [])].map(map).sort();
}

function sameList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function bucketCorsRuleMatches(current: BucketCorsRule | null | undefined, desired: BucketCorsRule): boolean {
  if (!current) return false;
  return sameList(sorted(current.AllowedOrigins), sorted(desired.AllowedOrigins))
    && sameList(sorted(current.AllowedMethods, (value) => value.toUpperCase()), sorted(desired.AllowedMethods, (value) => value.toUpperCase()))
    && sameList(sorted(current.AllowedHeaders, (value) => value.toLowerCase()), sorted(desired.AllowedHeaders, (value) => value.toLowerCase()))
    && Number(current.MaxAgeSeconds) === desired.MaxAgeSeconds;
}

export async function applyBucketCors(input: {
  origins: string[];
  getRules: () => Promise<BucketCorsRule[]>;
  putRules: (rules: BucketCorsRule[]) => Promise<void>;
}): Promise<"updated" | "unchanged"> {
  const desired = desiredBucketCorsRule(input.origins);
  const rules = await input.getRules();
  if (rules.length === 1 && bucketCorsRuleMatches(rules[0], desired)) return "unchanged";
  await input.putRules([desired]);
  return "updated";
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "name" in error && error.name) return String(error.name);
  return "bucket_cors_failed";
}

function isMissingCors(error: unknown): boolean {
  const name = errorCode(error);
  if (name === "NoSuchCORSConfiguration") return true;
  const status = error && typeof error === "object" && "$metadata" in error && error.$metadata && typeof error.$metadata === "object"
    ? Number((error.$metadata as { httpStatusCode?: number }).httpStatusCode)
    : 0;
  return status === 404 && name !== "NoSuchBucket";
}

async function loadSdk() {
  const client = await import("@aws-sdk/client-s3");
  return {
    S3Client: client.S3Client,
    GetBucketCorsCommand: client.GetBucketCorsCommand,
    PutBucketCorsCommand: client.PutBucketCorsCommand,
  };
}

function s3Client(config: S3Config, S3Client: new (input: Record<string, unknown>) => { send(command: unknown): Promise<{ CORSRules?: BucketCorsRule[] }> }) {
  if (!process.env.AWS_REQUEST_CHECKSUM_CALCULATION) {
    process.env.AWS_REQUEST_CHECKSUM_CALCULATION = "WHEN_REQUIRED";
  }
  if (!process.env.AWS_RESPONSE_CHECKSUM_VALIDATION) {
    process.env.AWS_RESPONSE_CHECKSUM_VALIDATION = "WHEN_REQUIRED";
  }
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/**
 * Browsers PUT the file directly to the presigned bucket URL, so the bucket
 * must allow that origin. A failed update is logged and does not stop the API.
 */
export async function ensureBucketCors(io?: BucketCorsIo): Promise<void> {
  try {
    if (selectStorageBackend() !== "s3") return;
    const origins = bucketUploadOrigins();
    if (!origins.length) {
      logger.warn("Bucket CORS was not updated because no upload origin is configured");
      return;
    }
    const config = readS3Config();
    const sdk = io ? null : await loadSdk();
    const client = sdk ? s3Client(config, sdk.S3Client as unknown as new (input: Record<string, unknown>) => { send(command: unknown): Promise<{ CORSRules?: BucketCorsRule[] }> }) : null;
    const getRules = io?.getRules ?? (async () => {
      try {
        const current = await client!.send(new sdk!.GetBucketCorsCommand({ Bucket: config.bucket }));
        return current.CORSRules ?? [];
      } catch (error) {
        if (isMissingCors(error)) return [];
        throw error;
      }
    });
    const putRules = io?.putRules ?? (async (rules: BucketCorsRule[]) => {
      const CORSRules: CORSRule[] = rules.map((rule) => ({
        AllowedOrigins: rule.AllowedOrigins,
        AllowedMethods: (rule.AllowedMethods ?? ["HEAD", "PUT"]) as CORSRule["AllowedMethods"],
        AllowedHeaders: rule.AllowedHeaders,
        MaxAgeSeconds: rule.MaxAgeSeconds,
      }));
      await client!.send(new sdk!.PutBucketCorsCommand({
        Bucket: config.bucket,
        CORSConfiguration: { CORSRules },
      }));
    });
    const result = await applyBucketCors({ origins, getRules, putRules });
    if (result === "updated") logger.info({ originCount: origins.length }, "Bucket CORS updated");
  } catch (error) {
    logger.warn({ code: errorCode(error) }, "Bucket CORS was not updated");
  }
}
