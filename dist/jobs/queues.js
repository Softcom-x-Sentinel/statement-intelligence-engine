"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMatchQueue = exports.parseUploadQueue = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("@config/env");
const connection = new ioredis_1.default(env_1.env.redisUrl);
exports.parseUploadQueue = new bullmq_1.Queue("parse-upload", {
    connection
});
exports.runMatchQueue = new bullmq_1.Queue("run-match", {
    connection
});
