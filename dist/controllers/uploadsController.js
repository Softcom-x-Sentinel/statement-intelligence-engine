"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleUpload = handleUpload;
exports.getUploadStatus = getUploadStatus;
const uploadService_1 = require("@services/uploadService");
const uploadService = new uploadService_1.UploadService();
async function handleUpload(req, res) {
    if (!req.file) {
        return res.status(400).json({ error: "Missing file field 'file'" });
    }
    try {
        const result = await uploadService.createUpload({
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
            path: req.file.path
        });
        return res.status(202).json(result);
    }
    catch (err) {
        return res.status(500).json({ error: "Failed to create upload", details: err?.message });
    }
}
async function getUploadStatus(req, res) {
    try {
        const { uploadId } = req.params;
        const status = await uploadService.getUploadStatus(uploadId);
        if (!status) {
            return res.status(404).json({ error: "Upload not found" });
        }
        return res.json(status);
    }
    catch (err) {
        return res.status(500).json({ error: "Failed to get upload status", details: err?.message });
    }
}
