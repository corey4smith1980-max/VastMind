/**
 * node-postgres does not apply libpq's sslmode the same way in every release.
 * Strip sslmode from the URL and set `ssl` explicitly.
 *
 * Railway services in the same project should use the private DATABASE_URL
 * (host ends in .railway.internal). That network is plain TCP.
 * Public Railway URLs set sslmode=require and need TLS.
 */
export function poolConfigFromUrl(connectionString, env = process.env) {
  if (!connectionString || typeof connectionString !== "string") {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL connection URL");
  }
  const sslmode = (url.searchParams.get("sslmode") || "").toLowerCase();
  url.searchParams.delete("sslmode");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const local =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".railway.internal");
  /** @type {{ connectionString: string, ssl?: false | { rejectUnauthorized: boolean } }} */
  const config = { connectionString: url.toString() };
  if (sslmode === "disable" || (!sslmode && local)) {
    config.ssl = false;
  } else if (sslmode === "verify-full" || sslmode === "verify-ca") {
    config.ssl = { rejectUnauthorized: true };
  } else if (
    sslmode === "require" ||
    sslmode === "prefer" ||
    sslmode === "no-verify" ||
    env.DATABASE_SSL === "require"
  ) {
    const reject = sslmode !== "no-verify" && env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
    config.ssl = { rejectUnauthorized: reject };
  }
  return config;
}
