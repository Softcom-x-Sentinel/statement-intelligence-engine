import fs from "fs";
import path from "path";
import { withClient } from "@db/pool";
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

    const result = await withClient(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO public.uploads (filename, mime_type, source_type, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', now(), now())
         RETURNING id, status`,
        [input.filename, input.mimeType, sourceType]
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
      status: result.status
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
}

