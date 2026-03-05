"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyAuth = apiKeyAuth;
const env_1 = require("../config/env");
function apiKeyAuth(req, res, next) {
    if (env_1.env.apiKeys.length === 0) {
        return next();
    }
    const headerKey = req.header("X-API-Key");
    if (!headerKey || !env_1.env.apiKeys.includes(headerKey)) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
}
