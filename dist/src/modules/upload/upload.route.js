"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const upload_1 = require("../../middleware/upload");
const upload_controller_1 = require("./upload.controller");
const router = (0, express_1.Router)();
/**
 * @swagger
 * /api/upload/photo:
 *   post:
 *     tags:
 *       - Upload
 *     summary: Upload a photo
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               folder:
 *                 type: string
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 description: File path, URL, or base64 data URI
 *               folder:
 *                 type: string
 *     responses:
 *       200:
 *         description: Photo uploaded successfully
 *       400:
 *         description: Validation failed
 */
router.post('/photo', upload_1.upload.single('file'), upload_controller_1.uploadPhotoHandler);
exports.default = router;
