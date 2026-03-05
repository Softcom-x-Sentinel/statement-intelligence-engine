"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const pool_1 = require("../db/pool");
const env_1 = require("../config/env");
const queues_1 = require("../jobs/queues");
const logger_1 = require("../utils/logger");
class UploadService {
    async createUpload(input) {
        const sourceType = input.mimeType.includes("pdf") ? "pdf" : "csv";
        // Compute file hash for deduplication
        const fileBuffer = await fs_1.default.promises.readFile(input.path);
        const fileHash = crypto_1.default.createHash("sha256").update(fileBuffer).digest("hex");
        // Check for existing upload with the same file hash
        const existing = await (0, pool_1.withClient)(async (client) => {
            const { rows } = await client.query(`SELECT id, status FROM public.uploads WHERE file_hash = $1 AND status != 'failed'`, [fileHash]);
            return rows[0] ?? null;
        });
        if (existing) {
            // Clean up the temp file since we won't use it
            await fs_1.default.promises.unlink(input.path).catch(() => { });
            logger_1.logger.info({ existingUploadId: existing.id, fileHash }, "Duplicate file detected");
            return {
                uploadId: existing.id,
                status: existing.status,
                duplicate: true
            };
        }
        const result = await (0, pool_1.withClient)(async (client) => {
            const { rows } = await client.query(`INSERT INTO public.uploads (filename, mime_type, source_type, file_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'pending', now(), now())
         RETURNING id, status`, [input.filename, input.mimeType, sourceType, fileHash]);
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
            status: result.status,
            duplicate: false
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
         FROM public.uploads u
         LEFT JOIN public.statements s ON s.upload_id = u.id
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
    async deleteUpload(uploadId) {
        const client = await pool_1.pool.connect();
        try {
            await client.query("BEGIN");
            // Check upload exists
            const { rows: uploadRows } = await client.query(`SELECT id FROM public.uploads WHERE id = $1`, [uploadId]);
            if (uploadRows.length === 0) {
                await client.query("ROLLBACK");
                return null;
            }
            // Get statement IDs for this upload
            const { rows: stmtRows } = await client.query(`SELECT id FROM public.statements WHERE upload_id = $1`, [uploadId]);
            const statementIds = stmtRows.map((r) => r.id);
            if (statementIds.length > 0) {
                // Get transaction IDs for these statements
                const { rows: txRows } = await client.query(`SELECT id FROM public.transactions WHERE statement_id = ANY($1)`, [statementIds]);
                const txIds = txRows.map((r) => r.id);
                if (txIds.length > 0) {
                    // Delete relationships referencing these transactions
                    await client.query(`DELETE FROM public.relationships WHERE tx_a_id = ANY($1) OR tx_b_id = ANY($1)`, [txIds]);
                    // Delete transactions
                    await client.query(`DELETE FROM public.transactions WHERE statement_id = ANY($1)`, [statementIds]);
                }
                // Delete statements
                await client.query(`DELETE FROM public.statements WHERE upload_id = $1`, [uploadId]);
            }
            // Delete upload row
            await client.query(`DELETE FROM public.uploads WHERE id = $1`, [uploadId]);
            await client.query("COMMIT");
            // Remove file from disk (best-effort)
            const filePath = path_1.default.join(env_1.env.uploadsDir, uploadId);
            await fs_1.default.promises.unlink(filePath).catch(() => { });
            logger_1.logger.info({ uploadId }, "Deleted upload and associated data");
            return { deleted: true };
        }
        catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
        finally {
            client.release();
        }
    }
}
exports.UploadService = UploadService;
