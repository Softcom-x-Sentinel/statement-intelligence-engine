"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadsRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const uploadsController_1 = require("../controllers/uploadsController");
const env_1 = require("../config/env");
exports.uploadsRouter = (0, express_1.Router)();
const upload = (0, multer_1.default)({ dest: env_1.env.uploadsDir });
// POST /v1/statements/upload
exports.uploadsRouter.post("/", upload.single("file"), uploadsController_1.handleUpload);
