import path from "path";
import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { env } from "@config/env";
import { logger } from "@utils/logger";
import { withClient } from "@db/pool";
import { getBankConfig } from "@ingestion/bankConfigs";
import { parseCsvFile } from "@ingestion/csvParser";
import { parsePdfFile } from "@ingestion/pdfParser";
import { RawTransactionRow } from "@ingestion/types";
import { normalizeTransaction } from "../normalization/normalizeTransaction";
import { recordDuration, incrementCounter } from "@utils/metrics";

interface ParseUploadJobData {
  uploadId: string;
  bankName?: string;
}

const processJob = async (job: Job<ParseUploadJobData>) => {
  const { uploadId, bankName } = job.data;

  const start = Date.now();
  logger.info({ uploadId, jobId: job.id }, "Starting parse-upload job");

  try {
    await withClient(async (client) => {
    const { rows } = await client.query(
      `SELECT id, filename, mime_type, source_type, status
       FROM public.uploads
       WHERE id = $1`,
      [uploadId]
    );

    if (rows.length === 0) {
      throw new Error(`Upload not found for id ${uploadId}`);
    }

    const upload = rows[0] as {
      id: string;
      filename: string;
      mime_type: string;
      source_type: string;
      status: string;
    };

    // Mark as parsing
    await client.query(
      `UPDATE public.uploads
       SET status = 'parsing', updated_at = now()
       WHERE id = $1`,
      [uploadId]
    );

    const sourceType = upload.source_type === "pdf" ? "pdf" : "csv";
    const bankConfig = getBankConfig(bankName, sourceType);

    if (!bankConfig) {
      throw new Error(`No bank configuration found for sourceType ${sourceType}`);
    }

    const filePath = path.join(env.uploadsDir, uploadId);

    let rawRows: RawTransactionRow[] = [];
    if (sourceType === "csv") {
      rawRows = await parseCsvFile({
        filePath,
        bankConfig
      });
    } else {
      rawRows = await parsePdfFile({
        filePath,
        bankConfig
      });
    }

    if (rawRows.length === 0) {
      throw new Error("No rows parsed from upload");
    }

    const currency = bankConfig.currency ?? rawRows[0].currency ?? null;

    const statementInsert = await client.query(
      `INSERT INTO public.statements (upload_id, bank_name, currency, raw_metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       RETURNING id`,
      [
        uploadId,
        bankName ?? bankConfig.bankName,
        currency,
        {
          filename: upload.filename,
          row_count: rawRows.length
        }
      ]
    );

    const statementId: string = statementInsert.rows[0].id;

    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    let skippedRows = 0;

    for (const raw of rawRows) {
      let tx;
      try {
        tx = normalizeTransaction(raw, bankConfig);
      } catch (normErr: any) {
        skippedRows++;
        logger.warn(
          { err: normErr.message, rawDate: raw.rawDate, description: raw.rawDescription },
          "Skipping row that failed normalization"
        );
        continue;
      }

      const postedAt = tx.postedAt;

      if (!minDate || postedAt < minDate) {
        minDate = postedAt;
      }
      if (!maxDate || postedAt > maxDate) {
        maxDate = postedAt;
      }

      await client.query(
        `INSERT INTO public.transactions
         (statement_id, posted_at, value_date, amount, currency,
          description_raw, description_norm, balance_after, hash_signature, extra, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5,
                 $6, $7, $8, $9, $10, now(), now())`,
        [
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
        ]
      );
    }

    if (skippedRows > 0) {
      logger.warn({ uploadId, skippedRows }, "Some rows were skipped during normalization");
    }

    if (minDate && maxDate) {
      await client.query(
        `UPDATE public.statements
         SET date_range_start = $1,
             date_range_end = $2,
             updated_at = now()
         WHERE id = $3`,
        [minDate, maxDate, statementId]
      );
    }

    await client.query(
      `UPDATE public.uploads
       SET status = 'parsed', updated_at = now()
       WHERE id = $1`,
      [uploadId]
    );

    const durationMs = Date.now() - start;
    recordDuration("parse_upload_duration_ms", durationMs, { uploadId });
    incrementCounter("parse_upload_success_total");

      logger.info(
        { uploadId, statementId, rowCount: rawRows.length, durationMs },
        "Completed parse-upload job"
      );
    });
  } catch (err: any) {
    await withClient(async (client) => {
      await client.query(
        `UPDATE public.uploads
         SET status = 'failed',
             error = $2,
             updated_at = now()
         WHERE id = $1`,
        [uploadId, err?.message ?? "Parse upload failed"]
      );
    });

    logger.error({ err, uploadId, jobId: job.id }, "parse-upload job failed");
    throw err;
  }
};

export const parseUploadWorker = new Worker<ParseUploadJobData>("parse-upload", processJob, {
  connection: new IORedis(env.redisUrl, { maxRetriesPerRequest: null })
});

parseUploadWorker.on("ready", () => {
  logger.info("parse-upload worker ready");
});

parseUploadWorker.on("active", (job) => {
  logger.info({ jobId: job.id, uploadId: job.data?.uploadId }, "parse-upload job active");
});

parseUploadWorker.on("completed", (job) => {
  logger.info({ jobId: job.id, uploadId: job.data?.uploadId }, "parse-upload job completed");
});

parseUploadWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, uploadId: job?.data?.uploadId, err }, "parse-upload job failed");
});

parseUploadWorker.on("error", (err) => {
  logger.error({ err }, "parse-upload worker error");
});

