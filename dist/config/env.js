"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const required = (value, name) => {
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
};
exports.env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: Number(process.env.PORT ?? 4000),
    corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:5713")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    databaseUrl: required(process.env.DATABASE_URL, "DATABASE_URL"),
    redisUrl: required(process.env.REDIS_URL, "REDIS_URL"),
    uploadsDir: process.env.UPLOADS_DIR ?? "data/uploads",
    apiKeys: (process.env.API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean),
    claudeApiKey: required(process.env.CLAUDE_API_KEY, "CLAUDE_API_KEY"),
    claudeModel: process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-latest",
    claudePromptVersion: process.env.CLAUDE_PROMPT_VERSION ?? "PROMPT_VERSION_1"
};
