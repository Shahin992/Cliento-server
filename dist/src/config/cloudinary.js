"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadPhotoBuffer = exports.uploadPhoto = void 0;
const cloudinary_1 = require("cloudinary");
const crypto_1 = __importDefault(require("crypto"));
const getCloudinaryConfig = () => {
    return {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
    };
};
const ensureCloudinaryConfig = () => {
    const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
    if (!cloudName || !apiKey || !apiSecret) {
        throw new Error('Missing Cloudinary env vars');
    }
    cloudinary_1.v2.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
    });
};
const uploadPhoto = async (file, options = {}) => {
    ensureCloudinaryConfig();
    const publicId = crypto_1.default.randomUUID();
    const uploadResult = await cloudinary_1.v2.uploader.upload(file, {
        folder: options.folder,
        public_id: publicId,
        resource_type: options.resourceType || 'image',
    });
    return {
        url: uploadResult.secure_url,
    };
};
exports.uploadPhoto = uploadPhoto;
const uploadPhotoBuffer = async (buffer, options = {}) => {
    ensureCloudinaryConfig();
    const publicId = crypto_1.default.randomUUID();
    return new Promise((resolve, reject) => {
        const stream = cloudinary_1.v2.uploader.upload_stream({
            folder: options.folder,
            public_id: publicId,
            resource_type: options.resourceType || 'image',
        }, (error, result) => {
            if (error || !result) {
                reject(error || new Error('Upload failed'));
                return;
            }
            resolve({
                url: result.secure_url,
            });
        });
        stream.end(buffer);
    });
};
exports.uploadPhotoBuffer = uploadPhotoBuffer;
