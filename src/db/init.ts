import fs from "fs";
import path from "path";
import { pool } from "@db/pool";
import { logger } from "@utils/logger";

export async function initializeDatabase() {
  const migrationPath = path.resolve(process.cwd(), "migrations/001_init.sql");
  const sql = await fs.promises.readFile(migrationPath, "utf8");

  await pool.query(sql);
  logger.info({ migrationPath }, "Database schema initialized");
}
