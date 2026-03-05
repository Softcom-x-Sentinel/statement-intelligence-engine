"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadsStatusRouter = void 0;
const express_1 = require("express");
const uploadsController_1 = require("../controllers/uploadsController");
exports.uploadsStatusRouter = (0, express_1.Router)();
// GET /v1/uploads/:uploadId
exports.uploadsStatusRouter.get("/:uploadId", uploadsController_1.getUploadStatus);
// DELETE /v1/uploads/:uploadId
exports.uploadsStatusRouter.delete("/:uploadId", uploadsController_1.deleteUpload);
