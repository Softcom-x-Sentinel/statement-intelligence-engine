import { Request, Response } from "express";
import { UploadService } from "@services/uploadService";

const uploadService = new UploadService();

export async function handleUpload(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ error: "Missing file field 'file'" });
  }

  try {
    const result = await uploadService.createUpload({
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      path: req.file.path
    });

    if (result.duplicate) {
      return res.status(200).json(result);
    }

    return res.status(202).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to create upload", details: err?.message });
  }
}

export async function getUploadStatus(req: Request, res: Response) {
  try {
    const { uploadId } = req.params;
    const status = await uploadService.getUploadStatus(uploadId);
    if (!status) {
      return res.status(404).json({ error: "Upload not found" });
    }
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to get upload status", details: err?.message });
  }
}

export async function deleteUpload(req: Request, res: Response) {
  try {
    const { uploadId } = req.params;
    const result = await uploadService.deleteUpload(uploadId);
    if (!result) {
      return res.status(404).json({ error: "Upload not found" });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to delete upload", details: err?.message });
  }
}


