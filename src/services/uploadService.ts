import fs from "fs";
import path from "path";
import crypto from "crypto";
import { withClient, pool } from "@db/pool";
import { env } from "@config/env";
import { parseUploadQueue } from "@jobs/queues";
import { logger } from "@utils/logger";

export interface CreateUploadInput {
  filename: string;
  mimeType: string;
  path: string;
}

export class UploadService {
  async createUpload(input: CreateUploadInput) {
    const sourceType = input.mimeType.includes("pdf") ? "pdf" : "csv";

    // Compute file hash for deduplication
    const fileBuffer = await fs.promises.readFile(input.path);
    const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    // Check for existing upload with the same file hash
    const existing = await withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT id, status FROM public.uploads WHERE file_hash = $1 AND status != 'failed'`,
        [fileHash]
      );
      return rows[0] ?? null;
    });

    if (existing) {
      // Clean up the temp file since we won't use it
      await fs.promises.unlink(input.path).catch(() => {});
      logger.info({ existingUploadId: existing.id, fileHash }, "Duplicate file detected");
      return {
        uploadId: existing.id,
        status: existing.status,
        duplicate: true
      };
    }

    const result = await withClient(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO public.uploads (filename, mime_type, source_type, file_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'pending', now(), now())
         RETURNING id, status`,
        [input.filename, input.mimeType, sourceType, fileHash]
      );
      return rows[0];
    });

    const uploadId: string = result.id;

    // Move file to a stable path based on uploadId so workers can find it deterministically.
    const targetDir = env.uploadsDir;
    const targetPath = path.join(targetDir, uploadId);

    await fs.promises.mkdir(targetDir, { recursive: true });
    await fs.promises.rename(input.path, targetPath);

    // Enqueue parse-upload job
    await parseUploadQueue.add("parse-upload", { uploadId });

    logger.info({ uploadId, sourceType }, "Enqueued parse-upload job");

    return {
      uploadId,
      status: result.status,
      duplicate: false
    };
  }

  async getUploadStatus(uploadId: string) {
    const result = await withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT u.id,
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
         GROUP BY u.id`,
        [uploadId]
      );
      return rows[0] ?? null;
    });

    if (!result) return null;

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

  async deleteUpload(uploadId: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check upload exists
      const { rows: uploadRows } = await client.query(
        `SELECT id FROM public.uploads WHERE id = $1`,
        [uploadId]
      );
      if (uploadRows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      // Get statement IDs for this upload
      const { rows: stmtRows } = await client.query(
        `SELECT id FROM public.statements WHERE upload_id = $1`,
        [uploadId]
      );
      const statementIds = stmtRows.map((r: any) => r.id);

      if (statementIds.length > 0) {
        // Get transaction IDs for these statements
        const { rows: txRows } = await client.query(
          `SELECT id FROM public.transactions WHERE statement_id = ANY($1)`,
          [statementIds]
        );
        const txIds = txRows.map((r: any) => r.id);

        if (txIds.length > 0) {
          // Delete relationships referencing these transactions
          await client.query(
            `DELETE FROM public.relationships WHERE tx_a_id = ANY($1) OR tx_b_id = ANY($1)`,
            [txIds]
          );

          // Delete transactions
          await client.query(
            `DELETE FROM public.transactions WHERE statement_id = ANY($1)`,
            [statementIds]
          );
        }

        // Delete statements
        await client.query(
          `DELETE FROM public.statements WHERE upload_id = $1`,
          [uploadId]
        );
      }

      // Delete upload row
      await client.query(
        `DELETE FROM public.uploads WHERE id = $1`,
        [uploadId]
      );

      await client.query("COMMIT");

      // Remove file from disk (best-effort)
      const filePath = path.join(env.uploadsDir, uploadId);
      await fs.promises.unlink(filePath).catch(() => {});

      logger.info({ uploadId }, "Deleted upload and associated data");
      return { deleted: true };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

