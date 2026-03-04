"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const express_1 = __importDefault(require("express"));
const express_2 = require("express");
const apiKeyAuth_1 = require("./middleware/apiKeyAuth");
const env_1 = require("@config/env");
const logger_1 = require("@utils/logger");
const uploads_1 = require("@routes/uploads");
const uploadsStatus_1 = require("@routes/uploadsStatus");
const statements_1 = require("@routes/statements");
const matchRuns_1 = require("@routes/matchRuns");
const createApp = () => {
    const app = (0, express_1.default)();
    const allowedOrigins = new Set(env_1.env.corsOrigins);
    app.use((0, express_2.json)({ limit: "10mb" }));
    app.use((req, res, next) => {
        const requestOrigin = req.headers.origin;
        if (requestOrigin && allowedOrigins.has(requestOrigin)) {
            res.header("Access-Control-Allow-Origin", requestOrigin);
            res.header("Vary", "Origin");
            res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
            res.header("Access-Control-Allow-Headers", "Content-Type,X-API-Key");
        }
        if (req.method === "OPTIONS") {
            return res.status(204).end();
        }
        return next();
    });
    app.use(apiKeyAuth_1.apiKeyAuth);
    // v1 routes
    app.use("/v1/statements/upload", uploads_1.uploadsRouter); // POST /v1/statements/upload
    app.use("/v1/uploads", uploadsStatus_1.uploadsStatusRouter); // GET /v1/uploads/:uploadId
    app.use("/v1/statements", statements_1.statementsRouter);
    app.use("/v1/match-runs", matchRuns_1.matchRunsRouter);
    app.use((err, _req, res, _next) => {
        logger_1.logger.error({ err }, "Unhandled error");
        res.status(500).json({ error: "Internal Server Error" });
    });
    return app;
};
exports.createApp = createApp;
