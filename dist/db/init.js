"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDatabase = initializeDatabase;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pool_1 = require("./pool");
const logger_1 = require("../utils/logger");
async function initializeDatabase() {
    const migrationPath = path_1.default.resolve(process.cwd(), "migrations/001_init.sql");
    const sql = await fs_1.default.promises.readFile(migrationPath, "utf8");
    await pool_1.pool.query(sql);
    logger_1.logger.info({ migrationPath }, "Database schema initialized");
}
