import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { poolConfigFromUrl } from "./pg-config.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL must be set before migrating.");
  process.exit(1);
}

const pool = new pg.Pool(poolConfigFromUrl(connectionString));
const db = drizzle(pool);
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "drizzle");

try {
  await migrate(db, { migrationsFolder });
  console.log("Database migrations applied.");
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "migration_failed";
  console.error(`Database migration failed (${code}).`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
