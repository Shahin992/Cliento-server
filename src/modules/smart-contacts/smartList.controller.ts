import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import {
  createContactList,
  deleteContactList,
  getContactListById,
  listContactLists,
  updateContactList,
} from './smartList.service';

const LENGTH = {
  name: 80,
  description: 300,
  listSearch: 100,
  contactsMax: 5000,
} as const;

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId format');

const nullableTrimmedString = (max: number) =>
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

const createContactListSchema = z.object({
  name: z.string().trim().min(1).max(LENGTH.name),
  description: nullableTrimmedString(LENGTH.description),
  contactIds: z.array(objectIdSchema).min(1).max(LENGTH.contactsMax),
});

const updateContactListSchema = createContactListSchema;

const listContactListsQuerySchema = z.object({
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

const listIdParamSchema = z.object({
  listId: objectIdSchema,
});

const getUserIdFromReq = (req: Request) => (req as any).user?.id as string | undefined;
const getQueryValue = (value: unknown) => (typeof value === 'string' ? value : undefined);

export const createContactListHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = createContactListSchema.parse(req.body);
    const result = await createContactList({
      ownerId: userId,
      name: parsed.name,
      description: parsed.description ?? null,
      contactIds: parsed.contactIds,
      createdBy: userId,
      updatedBy: userId,
    });

    if (result.status === 'duplicate_name') {
      return sendError(res, {
        success: false,
        statusCode: 409,
        message: 'A smart list with this name already exists',
      });
    }

    if (result.status === 'contact_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'One or more contacts not found',
        details: result.missingIds.join(', '),
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 201,
      message: 'Smart list created successfully',
      data: result.contactList,
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
      message: 'Failed to create smart list',
      details: (error as Error).message,
    });
  }
};

export const listContactListsHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const query = listContactListsQuerySchema.parse({
      page: getQueryValue(req.query.page),
      limit: getQueryValue(req.query.limit),
      search: getQueryValue(req.query.search) ?? getQueryValue(req.query.q),
    });

    const data = await listContactLists(userId, query);
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Smart lists fetched successfully',
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
      message: 'Failed to fetch smart lists',
      details: (error as Error).message,
    });
  }
};

export const getContactListByIdHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const { listId } = listIdParamSchema.parse(req.params);
    const contactList = await getContactListById(userId, listId);

    if (!contactList) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Smart list not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Smart list fetched successfully',
      data: contactList,
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
      message: 'Failed to fetch smart list',
      details: (error as Error).message,
    });
  }
};

export const updateContactListHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const { listId } = listIdParamSchema.parse(req.params);
    const parsed = updateContactListSchema.parse(req.body);

    const result = await updateContactList(userId, listId, {
      ...parsed,
      updatedBy: userId,
    });

    if (result.status === 'duplicate_name') {
      return sendError(res, {
        success: false,
        statusCode: 409,
        message: 'A smart list with this name already exists',
      });
    }

    if (result.status === 'contact_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'One or more contacts not found',
        details: result.missingIds.join(', '),
      });
    }

    if (result.status === 'not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Smart list not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Smart list updated successfully',
      data: result.contactList,
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
      message: 'Failed to update smart list',
      details: (error as Error).message,
    });
  }
};

export const deleteContactListHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const { listId } = listIdParamSchema.parse(req.params);
    const contactList = await deleteContactList(userId, listId, userId);

    if (!contactList) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Smart list not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Smart list deleted successfully',
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
      message: 'Failed to delete smart list',
      details: (error as Error).message,
    });
  }
};
