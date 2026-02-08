import { Router } from 'express';
import { upload } from '../../middleware/upload';
import { uploadPhotoHandler } from './upload.controller';

const router = Router();

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
router.post('/photo', upload.single('file'), uploadPhotoHandler);

export default router;
