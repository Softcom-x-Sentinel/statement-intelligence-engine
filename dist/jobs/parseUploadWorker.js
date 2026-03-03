"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUploadWorker = void 0;
const path_1 = __importDefault(require("path"));
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("@config/env");
const logger_1 = require("@utils/logger");
const pool_1 = require("@db/pool");
const bankConfigs_1 = require("@ingestion/bankConfigs");
const csvParser_1 = require("@ingestion/csvParser");
const pdfParser_1 = require("@ingestion/pdfParser");
const normalizeTransaction_1 = require("../normalization/normalizeTransaction");
const metrics_1 = require("@utils/metrics");
const processJob = async (job) => {
    const { uploadId, bankName } = job.data;
    const start = Date.now();
    logger_1.logger.info({ uploadId, jobId: job.id }, "Starting parse-upload job");
    await (0, pool_1.withClient)(async (client) => {
        const { rows } = await client.query(`SELECT id, filename, mime_type, source_type, status
       FROM uploads
       WHERE id = $1`, [uploadId]);
        if (rows.length === 0) {
            throw new Error(`Upload not found for id ${uploadId}`);
        }
        const upload = rows[0];
        // Mark as parsing
        await client.query(`UPDATE uploads
       SET status = 'parsing', updated_at = now()
       WHERE id = $1`, [uploadId]);
        const sourceType = upload.source_type === "pdf" ? "pdf" : "csv";
        const bankConfig = (0, bankConfigs_1.getBankConfig)(bankName, sourceType);
        if (!bankConfig) {
            throw new Error(`No bank configuration found for sourceType ${sourceType}`);
        }
        const filePath = path_1.default.join(env_1.env.uploadsDir, uploadId);
        let rawRows = [];
        if (sourceType === "csv") {
            rawRows = await (0, csvParser_1.parseCsvFile)({
                filePath,
                bankConfig
            });
        }
        else {
            rawRows = await (0, pdfParser_1.parsePdfFile)({
                filePath,
                bankConfig
            });
        }
        if (rawRows.length === 0) {
            throw new Error("No rows parsed from upload");
        }
        const currency = bankConfig.currency ?? rawRows[0].currency ?? null;
        const statementInsert = await client.query(`INSERT INTO statements (upload_id, bank_name, currency, raw_metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       RETURNING id`, [
            uploadId,
            bankName ?? bankConfig.bankName,
            currency,
            {
                filename: upload.filename,
                row_count: rawRows.length
            }
        ]);
        const statementId = statementInsert.rows[0].id;
        let minDate = null;
        let maxDate = null;
        for (const raw of rawRows) {
            const tx = (0, normalizeTransaction_1.normalizeTransaction)(raw, bankConfig);
            const postedAt = tx.postedAt;
            if (!minDate || postedAt < minDate) {
                minDate = postedAt;
            }
            if (!maxDate || postedAt > maxDate) {
                maxDate = postedAt;
            }
            await client.query(`INSERT INTO transactions
         (statement_id, posted_at, value_date, amount, currency,
          description_raw, description_norm, balance_after, hash_signature, extra, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5,
                 $6, $7, $8, $9, $10, now(), now())`, [
                statementId,
                tx.postedAt,
                tx.valueDate,
                tx.amount,
                tx.currency,
                tx.descriptionRaw,
                tx.descriptionNorm,
                tx.balanceAfter ?? null,
                tx.hashSignature,
                tx.extra ?? null
            ]);
        }
        if (minDate && maxDate) {
            await client.query(`UPDATE statements
         SET date_range_start = $1,
             date_range_end = $2,
             updated_at = now()
         WHERE id = $3`, [minDate, maxDate, statementId]);
        }
        await client.query(`UPDATE uploads
       SET status = 'parsed', updated_at = now()
       WHERE id = $1`, [uploadId]);
        const durationMs = Date.now() - start;
        (0, metrics_1.recordDuration)("parse_upload_duration_ms", durationMs, { uploadId });
        (0, metrics_1.incrementCounter)("parse_upload_success_total");
        logger_1.logger.info({ uploadId, statementId, rowCount: rawRows.length, durationMs }, "Completed parse-upload job");
    });
};
exports.parseUploadWorker = new bullmq_1.Worker("parse-upload", processJob, {
    connection: new ioredis_1.default(env_1.env.redisUrl)
});
