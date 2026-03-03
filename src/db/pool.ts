import { Pool, PoolClient } from "pg";
import { env } from "@config/env";
import { logger } from "@utils/logger";

export const pool = new Pool({
  connectionString: env.databaseUrl
});

pool.on("connect", (client: PoolClient) => {
  client.query("SET search_path TO public").catch((err: unknown) => {
    logger.error({ err }, "Failed to set Postgres search_path to public");
  });
});

pool.on("error", (err: unknown) => {
  logger.error({ err }, "Unexpected PG pool error");
});

export async function withClient<T>(fn: (client: Pool) => Promise<T>): Promise<T> {
  return fn(pool);
}

