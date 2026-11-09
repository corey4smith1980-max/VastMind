export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  prefix: string;
}

function first(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export function readS3Config(env: NodeJS.ProcessEnv = process.env): S3Config {
  const endpoint = first(env.S3_ENDPOINT, env.AWS_ENDPOINT_URL, env.ENDPOINT);
  const bucket = first(env.S3_BUCKET, env.AWS_S3_BUCKET_NAME, env.BUCKET);
  const region = first(env.S3_REGION, env.AWS_REGION, env.AWS_DEFAULT_REGION, env.REGION) || "auto";
  const accessKeyId = first(env.S3_ACCESS_KEY_ID, env.AWS_ACCESS_KEY_ID, env.ACCESS_KEY_ID);
  const secretAccessKey = first(env.S3_SECRET_ACCESS_KEY, env.AWS_SECRET_ACCESS_KEY, env.SECRET_ACCESS_KEY);
  const prefix = (first(env.S3_PREFIX) || "media").replace(/^\/+|\/+$/g, "");
  return {
    endpoint,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: forcePathStyle(endpoint, env),
    prefix,
  };
}

export function s3ConfigErrors(config: S3Config): string[] {
  const missing: string[] = [];
  if (!config.endpoint) missing.push("endpoint");
  if (!config.bucket) missing.push("bucket");
  if (!config.accessKeyId) missing.push("access key");
  if (!config.secretAccessKey) missing.push("secret");
  if (!config.prefix) missing.push("prefix");
  return missing;
}

function forcePathStyle(endpoint: string, env: NodeJS.ProcessEnv): boolean {
  const explicit = env.S3_FORCE_PATH_STYLE?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  const style = env.AWS_S3_URL_STYLE?.trim().toLowerCase();
  if (style === "path") return true;
  if (style === "virtual") return false;
  try {
    const host = new URL(endpoint).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "minio") return true;
  } catch {
    /* An invalid endpoint is reported by s3ConfigErrors. */
  }
  return false;
}

/** S3 wins when its variables are present. STORAGE_BACKEND=replit keeps App Storage. */
export function selectStorageBackend(env: NodeJS.ProcessEnv = process.env): "s3" | "replit" {
  const explicit = env.STORAGE_BACKEND?.trim().toLowerCase();
  if (explicit === "replit") return "replit";
  const config = readS3Config(env);
  const anyS3 = Boolean(config.endpoint || config.bucket || config.accessKeyId || config.secretAccessKey);
  if (explicit === "s3" || anyS3) {
    const missing = s3ConfigErrors(config);
    if (missing.length) {
      throw new Error(
        `S3 storage configuration is incomplete (${missing.join(", ")}). Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY. AWS_* names and Railway bucket names are also accepted.`,
      );
    }
    return "s3";
  }
  if (explicit && explicit !== "replit") {
    throw new Error("STORAGE_BACKEND must be s3 or replit.");
  }
  return "replit";
}
