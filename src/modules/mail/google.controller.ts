import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import {
  deleteGoogleMailbox,
  disconnectGoogleMailbox,
  getGoogleConnectUrl,
  getGoogleMailboxList,
  handleGoogleOAuthCallback,
  listGoogleInbox,
  makeDefaultGoogleMailbox,
  sendGoogleEmail,
} from './google.service';

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const sendMailSchema = z
  .object({
    to: z.array(z.string().email()).min(1),
    cc: z.array(z.string().email()).optional(),
    bcc: z.array(z.string().email()).optional(),
    subject: z.string().min(1),
    text: z.string().optional(),
    html: z.string().optional(),
    threadId: z.string().optional(),
  })
  .refine((data) => Boolean(data.text || data.html), {
    message: 'Either text or html content is required',
    path: ['text'],
  });

const listInboxQuerySchema = z.object({
  maxResults: z.coerce.number().int().min(1).max(50).optional(),
  pageToken: z.string().optional(),
  q: z.string().optional(),
});
const mailboxIdParamSchema = z.object({
  mailboxId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid mailboxId'),
});

const getUserIdFromReq = (req: Request) => (req as any).user?.id as string | undefined;
const getFrontendRedirectUrl = (type: 'success' | 'error') => {
  const successFallback = 'http://localhost:5173/google/callback?status=success';
  const errorFallback = 'http://localhost:5173/google/callback?status=error';
  const raw =
    type === 'success'
      ? process.env.GOOGLE_OAUTH_SUCCESS_REDIRECT || successFallback
      : process.env.GOOGLE_OAUTH_ERROR_REDIRECT || errorFallback;

  return new URL(raw).toString();
};

export const getGoogleAuthUrlHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'Unauthorized',
      });
    }

    const authUrl = getGoogleConnectUrl(userId);
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Google OAuth URL generated',
      data: { authUrl },
    });
  } catch (error) {
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to generate Google OAuth URL',
      details: (error as Error).message,
    });
  }
};

export const googleOAuthCallbackHandler = async (req: Request, res: Response) => {
  try {
    const parsed = callbackQuerySchema.parse(req.query);
    const result = await handleGoogleOAuthCallback(parsed.code, parsed.state);

    if (result.status === 'invalid_state') {
      return res.redirect(getFrontendRedirectUrl('error'));
    }

    if (result.status === 'missing_tokens') {
      return res.redirect(getFrontendRedirectUrl('error'));
    }

    if (result.status === 'missing_email') {
      return res.redirect(getFrontendRedirectUrl('error'));
    }

    return res.redirect(getFrontendRedirectUrl('success'));
  } catch (error) {
    return res.redirect(getFrontendRedirectUrl('error'));
  }
};

export const getGoogleMailboxListHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'Unauthorized',
      });
    }

    const authUrl = getGoogleConnectUrl(userId);
    const result = await getGoogleMailboxList(userId);
    const mailboxes = result.mailboxes.map((mailbox) => ({
      ...mailbox.toObject(),
      connected: !mailbox.isDisconnected && !mailbox.isDeleted,
    }));

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Google mailbox list fetched',
      data: {
        authUrl,
        total: mailboxes.length,
        connectedCount: mailboxes.filter((mailbox) => mailbox.connected).length,
        mailboxes,
      },
    });
  } catch (error) {
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to fetch Google mailbox list',
      details: (error as Error).message,
    });
  }
};

export const sendGoogleEmailHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'Unauthorized',
      });
    }

    const parsed = sendMailSchema.parse(req.body);
    const result = await sendGoogleEmail({
      userId,
      ...parsed,
    });

    if (result.status !== 'ok') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Google mailbox not connected',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Email sent via Gmail',
      data: result.message,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((item) => `${item.path.join('.')}: ${item.message}`).join(', '),
      });
    }

    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to send Gmail message',
      details: (error as Error).message,
    });
  }
};

export const listGoogleInboxHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'Unauthorized',
      });
    }

    const parsed = listInboxQuerySchema.parse(req.query);
    const result = await listGoogleInbox({
      userId,
      maxResults: parsed.maxResults || 20,
      pageToken: parsed.pageToken,
      q: parsed.q,
    });

    if (result.status !== 'ok') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Google mailbox not connected',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Inbox fetched',
      data: {
        messages: result.messages,
        nextPageToken: result.nextPageToken,
        resultSizeEstimate: result.resultSizeEstimate,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((item) => `${item.path.join('.')}: ${item.message}`).join(', '),
      });
    }

    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to fetch Gmail inbox',
      details: (error as Error).message,
    });
  }
};

export const disconnectGoogleMailboxHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'Unauthorized',
      });
    }

    const parsed = mailboxIdParamSchema.parse(req.params);
    const result = await disconnectGoogleMailbox(userId, parsed.mailboxId);
    if (result.status === 'not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Google mailbox not connected',
      });
    }
    if (result.status === 'already_disconnected') {
      return sendError(res, {
        success: false,
        statusCode: 409,
        message: 'Google mailbox already disconnected',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Google mailbox disconnected',
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((item) => `${item.path.join('.')}: ${item.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to disconnect Gmail mailbox',
      details: (error as Error).message,
    });
  }
};

export const deleteGoogleMailboxHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'Unauthorized',
      });
    }

    const parsed = mailboxIdParamSchema.parse(req.params);
    const result = await deleteGoogleMailbox(userId, parsed.mailboxId);
    if (result.status !== 'ok') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Google mailbox not connected',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Google mailbox deleted',
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((item) => `${item.path.join('.')}: ${item.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to delete Gmail mailbox',
      details: (error as Error).message,
    });
  }
};

export const makeDefaultGoogleMailboxHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'Unauthorized',
      });
    }

    const parsed = mailboxIdParamSchema.parse(req.params);
    const result = await makeDefaultGoogleMailbox(userId, parsed.mailboxId);
    if (result.status !== 'ok') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Mailbox not found or not active',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Default mailbox updated',
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((item) => `${item.path.join('.')}: ${item.message}`).join(', '),
      });
    }

    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to update default mailbox',
      details: (error as Error).message,
    });
  }
};
