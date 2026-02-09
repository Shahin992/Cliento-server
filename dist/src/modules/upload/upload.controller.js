"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadPhotoHandler = void 0;
const zod_1 = require("zod");
const response_1 = require("../../../Utils/response");
const cloudinary_1 = require("../../config/cloudinary");
const uploadPhotoSchema = zod_1.z.object({
    file: zod_1.z.string().optional(),
    folder: zod_1.z.string().optional(),
});
const uploadPhotoHandler = async (req, res) => {
    try {
        const parsed = uploadPhotoSchema.parse(req.body);
        let result;
        if (req.file?.buffer) {
            result = await (0, cloudinary_1.uploadPhotoBuffer)(req.file.buffer, {
                folder: parsed.folder,
            });
        }
        else if (parsed.file) {
            result = await (0, cloudinary_1.uploadPhoto)(parsed.file, {
                folder: parsed.folder,
            });
        }
        else {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 400,
                message: 'Validation failed',
                details: 'file is required',
            });
        }
        return (0, response_1.sendResponse)(res, {
            success: true,
            statusCode: 200,
            message: 'Photo uploaded successfully',
            data: result,
        });
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 400,
                message: 'Validation failed',
                details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
            });
        }
        return (0, response_1.sendError)(res, {
            success: false,
            statusCode: 500,
            message: 'Failed to upload photo',
            details: error.message,
        });
    }
};
exports.uploadPhotoHandler = uploadPhotoHandler;
