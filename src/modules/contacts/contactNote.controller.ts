import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import { createContactNote, deleteContactNote, getContactNoteById, listContactNotes, updateContactNote } from './contactNote.service';

const LENGTH = {
  noteBody: 5000,
} as const;

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId format');

const createContactNoteSchema = z.object({
  contactId: objectIdSchema,
  body: z.string().trim().min(1).max(LENGTH.noteBody),
});

const listContactNotesQuerySchema = z.object({
  contactId: objectIdSchema,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(10),
});

const noteIdParamSchema = z.object({
  id: objectIdSchema,
});

const updateContactNoteSchema = z.object({
  body: z.string().trim().min(1).max(LENGTH.noteBody),
});

const getUserIdFromReq = (req: Request) => (req as any).user?.id as string | undefined;
const getQueryValue = (value: unknown) => (typeof value === 'string' ? value : undefined);

export const createContactNoteHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = createContactNoteSchema.parse(req.body);
    const result = await createContactNote({
      ownerId: userId,
      contactId: parsed.contactId,
      body: parsed.body,
      createdBy: userId,
      updatedBy: userId,
    });

    if (result.status === 'contact_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Contact not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 201,
      message: 'Contact note created successfully',
      data: result.note,
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
      message: 'Failed to create contact note',
      details: (error as Error).message,
    });
  }
};

export const listContactNotesHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = listContactNotesQuerySchema.parse({
      contactId: getQueryValue(req.query.contactId),
      page: getQueryValue(req.query.page),
      limit: getQueryValue(req.query.limit),
    });

    const result = await listContactNotes(userId, parsed);
    if (result.status === 'contact_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Contact not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Contact notes fetched successfully',
      data: result.data,
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
      message: 'Failed to fetch contact notes',
      details: (error as Error).message,
    });
  }
};

export const getContactNoteByIdHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const { id } = noteIdParamSchema.parse(req.params);
    const note = await getContactNoteById(userId, id);
    if (!note) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Contact note not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Contact note fetched successfully',
      data: note,
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
      message: 'Failed to fetch contact note',
      details: (error as Error).message,
    });
  }
};

export const updateContactNoteHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const { id } = noteIdParamSchema.parse(req.params);
    const parsed = updateContactNoteSchema.parse(req.body);

    const note = await updateContactNote(userId, id, {
      body: parsed.body,
      updatedBy: userId,
    });

    if (!note) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Contact note not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Contact note updated successfully',
      data: note,
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
      message: 'Failed to update contact note',
      details: (error as Error).message,
    });
  }
};

export const deleteContactNoteHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const { id } = noteIdParamSchema.parse(req.params);
    const note = await deleteContactNote(userId, id, userId);
    if (!note) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Contact note not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Contact note deleted successfully',
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
      message: 'Failed to delete contact note',
      details: (error as Error).message,
    });
  }
};
