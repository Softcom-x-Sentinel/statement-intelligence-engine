"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pool_1 = require("@db/pool");
const env_1 = require("@config/env");
const queues_1 = require("@jobs/queues");
const logger_1 = require("@utils/logger");
class UploadService {
    async createUpload(input) {
        const sourceType = input.mimeType.includes("pdf") ? "pdf" : "csv";
        const result = await (0, pool_1.withClient)(async (client) => {
            const { rows } = await client.query(`INSERT INTO uploads (filename, mime_type, source_type, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', now(), now())
         RETURNING id, status`, [input.filename, input.mimeType, sourceType]);
            return rows[0];
        });
        const uploadId = result.id;
        // Move file to a stable path based on uploadId so workers can find it deterministically.
        const targetDir = env_1.env.uploadsDir;
        const targetPath = path_1.default.join(targetDir, uploadId);
        await fs_1.default.promises.mkdir(targetDir, { recursive: true });
        await fs_1.default.promises.rename(input.path, targetPath);
        // Enqueue parse-upload job
        await queues_1.parseUploadQueue.add("parse-upload", { uploadId });
        logger_1.logger.info({ uploadId, sourceType }, "Enqueued parse-upload job");
        return {
            uploadId,
            status: result.status
        };
    }
    async getUploadStatus(uploadId) {
        const result = await (0, pool_1.withClient)(async (client) => {
            const { rows } = await client.query(`SELECT u.id,
                u.status,
                u.error,
                u.filename,
                u.mime_type,
                u.source_type,
                u.created_at,
                u.updated_at,
                json_agg(s.id) FILTER (WHERE s.id IS NOT NULL) AS statement_ids
         FROM uploads u
         LEFT JOIN statements s ON s.upload_id = u.id
         WHERE u.id = $1
         GROUP BY u.id`, [uploadId]);
            return rows[0] ?? null;
        });
        if (!result)
            return null;
        return {
            uploadId: result.id,
            status: result.status,
            error: result.error,
            filename: result.filename,
            mimeType: result.mime_type,
            sourceType: result.source_type,
            createdAt: result.created_at,
            updatedAt: result.updated_at,
            statementIds: result.statement_ids ?? []
        };
    }
}
exports.UploadService = UploadService;
