import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import { syncGoogleInboxRepliesForContact } from '../mail/google.service';
import {
  createConversation,
  deleteConversation,
  getConversationById,
  listConversations,
  upsertConversationByExternalMessage,
  updateConversation,
} from './conversation.service';

const LENGTH = {
  subject: 250,
  body: 10000,
  participant: 100,
  externalId: 200,
} as const;

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const optionalNullableObjectIdSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  objectIdSchema.nullable().optional()
);

const optionalNullableStringSchema = (max: number) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    },
    z.string().max(max).nullable().optional()
  );

const optionalParticipantsSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined;
    const values = Array.isArray(value) ? value : [value];
    return values
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  },
  z.array(z.string().max(LENGTH.participant)).max(50).optional()
);

const createConversationSchema = z.object({
  contactId: optionalNullableObjectIdSchema,
  mailboxId: optionalNullableObjectIdSchema,
  method: z.enum(['email', 'sms']),
  direction: z.enum(['incoming', 'outgoing']),
  subject: optionalNullableStringSchema(LENGTH.subject),
  body: optionalNullableStringSchema(LENGTH.body),
  participants: optionalParticipantsSchema,
  externalMessageId: optionalNullableStringSchema(LENGTH.externalId),
  externalThreadId: optionalNullableStringSchema(LENGTH.externalId),
  sentAt: z.coerce.date().nullable().optional(),
});

const upsertConversationSchema = createConversationSchema.extend({
  externalMessageId: z.string().trim().min(1).max(LENGTH.externalId),
});

const updateConversationSchema = z
  .object({
    contactId: optionalNullableObjectIdSchema,
    mailboxId: optionalNullableObjectIdSchema,
    direction: z.enum(['incoming', 'outgoing']).optional(),
    subject: optionalNullableStringSchema(LENGTH.subject),
    body: optionalNullableStringSchema(LENGTH.body),
    participants: optionalParticipantsSchema,
    externalThreadId: optionalNullableStringSchema(LENGTH.externalId),
    sentAt: z.coerce.date().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const listConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(10),
  contactId: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    objectIdSchema
  ),
});

const getUserIdFromReq = (req: Request) => (req as any).user?.id as string | undefined;
const getQueryValue = (value: unknown) => (typeof value === 'string' ? value : undefined);

export const createConversationHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = createConversationSchema.parse(req.body);
    const result = await createConversation({
      ownerId: userId,
      contactId: parsed.contactId ?? null,
      mailboxId: parsed.mailboxId ?? null,
      method: parsed.method,
      direction: parsed.direction,
      subject: parsed.subject ?? null,
      body: parsed.body ?? null,
      participants: parsed.participants ?? [],
      externalMessageId: parsed.externalMessageId ?? null,
      externalThreadId: parsed.externalThreadId ?? null,
      sentAt: parsed.sentAt ?? null,
      createdBy: userId,
      updatedBy: userId,
    });

    if (result.status === 'duplicate_external_message') {
      return sendError(res, {
        success: false,
        statusCode: 409,
        message: 'Conversation already exists for this external message',
        details: String(result.conversationId),
      });
    }
    if (result.status === 'contact_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Contact not found for this user',
      });
    }
    if (result.status === 'mailbox_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Mailbox not found for this user',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 201,
      message: 'Conversation created successfully',
      data: result.conversation,
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
      message: 'Failed to create conversation',
      details: (error as Error).message,
    });
  }
};

export const upsertConversationHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = upsertConversationSchema.parse(req.body);
    const result = await upsertConversationByExternalMessage({
      ownerId: userId,
      contactId: parsed.contactId ?? null,
      mailboxId: parsed.mailboxId ?? null,
      method: parsed.method,
      direction: parsed.direction,
      subject: parsed.subject ?? null,
      body: parsed.body ?? null,
      participants: parsed.participants ?? [],
      externalMessageId: parsed.externalMessageId,
      externalThreadId: parsed.externalThreadId ?? null,
      sentAt: parsed.sentAt ?? null,
      createdBy: userId,
      updatedBy: userId,
    });

    if (result.status === 'external_message_id_required') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'externalMessageId is required',
      });
    }
    if (result.status === 'contact_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Contact not found for this user',
      });
    }
    if (result.status === 'mailbox_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Mailbox not found for this user',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: result.status === 'created' ? 201 : 200,
      message: result.status === 'created' ? 'Conversation created successfully' : 'Conversation updated successfully',
      data: result.conversation,
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
      message: 'Failed to upsert conversation',
      details: (error as Error).message,
    });
  }
};

export const getConversationByIdHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const conversationId = objectIdSchema.parse(req.params.id);
    const result = await getConversationById(userId, conversationId);

    if (result.status === 'conversation_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Conversation not found',
      });
    }
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Conversation fetched successfully',
      data: result.conversation,
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
      message: 'Failed to fetch conversation',
      details: (error as Error).message,
    });
  }
};

export const listConversationsHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const query = listConversationsQuerySchema.parse({
      page: getQueryValue(req.query.page),
      limit: getQueryValue(req.query.limit),
      contactId: getQueryValue(req.query.contactId),
    });

    const syncResult = await Promise.race([
      syncGoogleInboxRepliesForContact({
        userId,
        contactId: query.contactId,
        maxResultsPerMailbox: 10,
        maxMailboxes: 1,
      }),
      new Promise<{ status: 'timeout' }>((resolve) => setTimeout(() => resolve({ status: 'timeout' }), 3500)),
    ]);
    if (syncResult.status === 'contact_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Contact not found for this user',
      });
    }

    const result = await listConversations(userId, query);
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Conversations fetched successfully',
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
      message: 'Failed to fetch conversations',
      details: (error as Error).message,
    });
  }
};

export const updateConversationHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const conversationId = objectIdSchema.parse(req.params.id);
    const parsed = updateConversationSchema.parse(req.body);

    const result = await updateConversation({
      ownerId: userId,
      conversationId,
      contactId: parsed.contactId,
      mailboxId: parsed.mailboxId,
      direction: parsed.direction,
      subject: parsed.subject,
      body: parsed.body,
      participants: parsed.participants,
      externalThreadId: parsed.externalThreadId,
      sentAt: parsed.sentAt,
      updatedBy: userId,
    });

    if (result.status === 'conversation_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Conversation not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Conversation updated successfully',
      data: result.conversation,
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
      message: 'Failed to update conversation',
      details: (error as Error).message,
    });
  }
};

export const deleteConversationHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const conversationId = objectIdSchema.parse(req.params.id);
    const result = await deleteConversation(userId, conversationId, userId);

    if (result.status === 'conversation_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Conversation not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Conversation deleted successfully',
      data: result.conversation,
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
      message: 'Failed to delete conversation',
      details: (error as Error).message,
    });
  }
};
