import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import { uploadPhoto, uploadPhotoBuffer } from '../../config/cloudinary';

const uploadPhotoSchema = z.object({
  file: z.string().optional(),
  folder: z.string().optional(),
});

export const uploadPhotoHandler = async (req: Request, res: Response) => {
  try {
    const parsed = uploadPhotoSchema.parse(req.body);
    let result;

    if (req.file?.buffer) {
      result = await uploadPhotoBuffer(req.file.buffer, {
        folder: parsed.folder,
      });
    } else if (parsed.file) {
      result = await uploadPhoto(parsed.file, {
        folder: parsed.folder,
      });
    } else {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: 'file is required',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Photo uploaded successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to upload photo',
      details: (error as Error).message,
    });
  }
};
