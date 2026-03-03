"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.withClient = withClient;
const pg_1 = require("pg");
const env_1 = require("@config/env");
const logger_1 = require("@utils/logger");
exports.pool = new pg_1.Pool({
    connectionString: env_1.env.databaseUrl
});
exports.pool.on("error", (err) => {
    logger_1.logger.error({ err }, "Unexpected PG pool error");
});
async function withClient(fn) {
    return fn(exports.pool);
}
