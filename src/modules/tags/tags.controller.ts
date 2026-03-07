import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import { createTag, deleteTag, getTagById, listTags, updateTag } from './tags.service';

const LENGTH = {
  name: 40,
  description: 300,
  listSearch: 100,
} as const;

const objectIdSchema = z.string().trim().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId format');

const nullableString = (max: number) =>
  z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    },
    z.string().max(max).nullable().optional()
  );

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color must be a valid hex code');

const createTagSchema = z.object({
  name: z.string().trim().min(1).max(LENGTH.name),
  color: z.preprocess(
    (value) => {
      if (value === undefined || value === null) return null;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    },
    hexColorSchema.nullable().optional()
  ),
  description: nullableString(LENGTH.description),
});

const updateTagSchema = z.object({
  name: z.string().trim().min(1).max(LENGTH.name).optional(),
  color: z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    },
    hexColorSchema.nullable().optional()
  ),
  description: nullableString(LENGTH.description),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

const listTagsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(10),
  search: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(LENGTH.listSearch).optional()
  ),
});

const tagIdParamSchema = z.object({
  tagId: objectIdSchema,
});

const getUserIdFromReq = (req: Request) => (req as any).user?.id as string | undefined;
const getQueryValue = (value: unknown) => (typeof value === 'string' ? value : undefined);

export const createTagHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = createTagSchema.parse(req.body);
    const result = await createTag({
      ownerId: userId,
      name: parsed.name,
      color: parsed.color ?? null,
      description: parsed.description ?? null,
      createdBy: userId,
      updatedBy: userId,
    });

    if (result.status === 'duplicate_name') {
      return sendError(res, {
        success: false,
        statusCode: 409,
        message: 'A tag with this name already exists',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 201,
      message: 'Tag created successfully',
      data: result.tag,
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
      message: 'Failed to create tag',
      details: (error as Error).message,
    });
  }
};

export const listTagsHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const query = listTagsQuerySchema.parse({
      page: getQueryValue(req.query.page),
      limit: getQueryValue(req.query.limit),
      search: getQueryValue(req.query.search) ?? getQueryValue(req.query.q),
    });

    const data = await listTags(userId, query);

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Tags fetched successfully',
      data,
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
      message: 'Failed to fetch tags',
      details: (error as Error).message,
    });
  }
};

export const getTagByIdHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const { tagId } = tagIdParamSchema.parse(req.params);
    const tag = await getTagById(userId, tagId);

    if (!tag) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Tag not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Tag fetched successfully',
      data: tag,
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
      message: 'Failed to fetch tag',
      details: (error as Error).message,
    });
  }
};

export const updateTagHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const { tagId } = tagIdParamSchema.parse(req.params);
    const parsed = updateTagSchema.parse(req.body);

    const result = await updateTag(userId, tagId, {
      ...parsed,
      updatedBy: userId,
    });

    if (result.status === 'duplicate_name') {
      return sendError(res, {
        success: false,
        statusCode: 409,
        message: 'A tag with this name already exists',
      });
    }

    if (result.status === 'not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Tag not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Tag updated successfully',
      data: result.tag,
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
      message: 'Failed to update tag',
      details: (error as Error).message,
    });
  }
};

export const deleteTagHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const { tagId } = tagIdParamSchema.parse(req.params);
    const deletedTag = await deleteTag(userId, tagId, userId);

    if (!deletedTag) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Tag not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Tag deleted successfully',
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
      message: 'Failed to delete tag',
      details: (error as Error).message,
    });
  }
};
