import { Router } from "express";
import { getUploadStatus } from "@controllers/uploadsController";

export const uploadsStatusRouter = Router();

// GET /v1/uploads/:uploadId
uploadsStatusRouter.get("/:uploadId", getUploadStatus);

