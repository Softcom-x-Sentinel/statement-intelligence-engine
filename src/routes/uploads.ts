import { Router } from "express";
import multer from "multer";
import { handleUpload } from "@controllers/uploadsController";
import { env } from "@config/env";

export const uploadsRouter = Router();

const upload = multer({ dest: env.uploadsDir });

// POST /v1/statements/upload
uploadsRouter.post("/", upload.single("file"), handleUpload);


