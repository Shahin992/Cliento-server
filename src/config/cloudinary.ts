import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';

type UploadOptions = {
  folder?: string;
  publicId?: string;
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
};

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
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
};

export const uploadPhoto = async (file: string, options: UploadOptions = {}) => {
  ensureCloudinaryConfig();
  const publicId =  crypto.randomUUID();
  const uploadResult = await cloudinary.uploader.upload(file, {
    folder: options.folder,
    public_id: publicId,
    resource_type: options.resourceType || 'image',
  });

  return {
    url: uploadResult.secure_url,
  };
};

export const uploadPhotoBuffer = async (buffer: Buffer, options: UploadOptions = {}) => {
  ensureCloudinaryConfig();
  const publicId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: publicId,
        resource_type: options.resourceType || 'image',
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Upload failed'));
          return;
        }
        resolve({
          url: result.secure_url,
          });
      }
    );

    stream.end(buffer);
  });
};
