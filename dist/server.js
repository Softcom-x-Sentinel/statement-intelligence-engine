"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
const init_1 = require("./db/init");
require("./jobs/parseUploadWorker");
require("./jobs/runMatchWorker");
const app = (0, app_1.createApp)();
async function start() {
    try {
        await (0, init_1.initializeDatabase)();
        app.listen(env_1.env.port, () => {
            logger_1.logger.info({ port: env_1.env.port }, "Server started");
        });
    }
    catch (err) {
        logger_1.logger.error({ err }, "Failed to initialize server");
        process.exit(1);
    }
}
void start();
