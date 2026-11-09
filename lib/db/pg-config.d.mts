import type { PoolConfig } from "pg";

export function poolConfigFromUrl(
  connectionString: string,
  env?: NodeJS.ProcessEnv,
): PoolConfig;
