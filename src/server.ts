import { createApp } from "./app";
import { env } from "@config/env";
import { logger } from "@utils/logger";
import { initializeDatabase } from "@db/init";
import "@jobs/parseUploadWorker";

const app = createApp();

async function start() {
  try {
    await initializeDatabase();

    app.listen(env.port, () => {
      logger.info({ port: env.port }, "Server started");
    });
  } catch (err) {
    logger.error({ err }, "Failed to initialize server");
    process.exit(1);
  }
}

void start();

