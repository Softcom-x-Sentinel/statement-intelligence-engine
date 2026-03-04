import { Router } from "express";
import { getUploadStatus, deleteUpload } from "@controllers/uploadsController";

export const uploadsStatusRouter = Router();

// GET /v1/uploads/:uploadId
uploadsStatusRouter.get("/:uploadId", getUploadStatus);

// DELETE /v1/uploads/:uploadId
uploadsStatusRouter.delete("/:uploadId", deleteUpload);

