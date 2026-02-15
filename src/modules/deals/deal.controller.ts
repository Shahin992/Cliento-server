import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import {
  createDeal,
  deleteDeal,
  getDealDetails,
  listDealsByContact,
  listDeals,
  markDealLost,
  markDealWon,
  updateDeal,
} from './deal.service';

const LENGTH = {
  title: 120,
  lostReason: 500,
} as const;

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const optionalNullableObjectIdSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  objectIdSchema.nullable()
);

const createDealSchema = z.object({
  ownerId: objectIdSchema,
  pipelineId: objectIdSchema,
  stageId: objectIdSchema,
  title: z.string().trim().min(1).max(LENGTH.title),
  amount: z.coerce.number().min(0).nullable().optional(),
  contactId: optionalNullableObjectIdSchema.optional(),
  expectedCloseDate: z.coerce.date().nullable().optional(),
});

const updateDealSchema = z.object({
  pipelineId: objectIdSchema.optional(),
  stageId: objectIdSchema.optional(),
  title: z.string().trim().min(1).max(LENGTH.title).optional(),
  amount: z.coerce.number().min(0).nullable().optional(),
  contactId: optionalNullableObjectIdSchema.optional(),
  expectedCloseDate: z.coerce.date().nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

const dealActionSchema = z.object({
  dealId: objectIdSchema,
});

const dealLostActionSchema = z.object({
  dealId: objectIdSchema,
  lostReason: z.preprocess(
    (value) => {
      if (value === undefined || value === null) return null;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    },
    z.string().max(LENGTH.lostReason).nullable().optional()
  ),
});

const listDealsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(10),
  search: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(LENGTH.title).optional()
  ),
  status: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim().toLowerCase();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.enum(['open', 'won', 'lost']).optional()
  ),
  pipelineId: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    objectIdSchema.optional()
  ),
});

const listContactDealsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(10),
  search: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(LENGTH.title).optional()
  ),
  status: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim().toLowerCase();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.enum(['open', 'won', 'lost']).optional()
  ),
});

const getUserIdFromReq = (req: Request) => (req as any).user?.id as string | undefined;
const getQueryValue = (value: unknown) => (typeof value === 'string' ? value : undefined);

export const createDealHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = createDealSchema.parse(req.body);

    if (parsed.ownerId !== userId) {
      return sendError(res, {
        success: false,
        statusCode: 403,
        message: 'ownerId must match authenticated user',
      });
    }

    const result = await createDeal({
      ownerId: parsed.ownerId,
      pipelineId: parsed.pipelineId,
      stageId: parsed.stageId,
      title: parsed.title,
      amount: parsed.amount ?? null,
      contactId: parsed.contactId ?? null,
      expectedCloseDate: parsed.expectedCloseDate ?? null,
      createdBy: userId,
      updatedBy: userId,
    });

    if (result.status === 'pipeline_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Pipeline not found',
      });
    }
    if (result.status === 'invalid_stage_for_pipeline') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Stage does not belong to this pipeline',
      });
    }
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
      message: 'Deal created successfully',
      data: result.deal,
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
      message: 'Failed to create deal',
      details: (error as Error).message,
    });
  }
};

export const getDealDetailsHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const dealId = objectIdSchema.parse(req.params.dealId);
    const result = await getDealDetails(userId, dealId);

    if (result.status === 'deal_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Deal not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Deal fetched successfully',
      data: result.deal,
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
      message: 'Failed to fetch deal',
      details: (error as Error).message,
    });
  }
};

export const listDealsHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const query = listDealsQuerySchema.parse({
      page: getQueryValue(req.query.page),
      limit: getQueryValue(req.query.limit),
      search: getQueryValue(req.query.search) ?? getQueryValue(req.query.q),
      status: getQueryValue(req.query.status),
      pipelineId: getQueryValue(req.query.pipelineId),
    });

    const result = await listDeals(userId, query);

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Deals fetched successfully',
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
      message: 'Failed to fetch deals',
      details: (error as Error).message,
    });
  }
};

export const listContactDealsHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const contactId = objectIdSchema.parse(req.params.contactId);
    const query = listContactDealsQuerySchema.parse({
      page: getQueryValue(req.query.page),
      limit: getQueryValue(req.query.limit),
      search: getQueryValue(req.query.search) ?? getQueryValue(req.query.q),
      status: getQueryValue(req.query.status),
    });

    const result = await listDealsByContact(userId, contactId, query);

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
      message: 'Contact deals fetched successfully',
      data: {
        deals: result.deals,
        pagination: result.pagination,
      },
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
      message: 'Failed to fetch contact deals',
      details: (error as Error).message,
    });
  }
};

export const updateDealHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const dealId = objectIdSchema.parse(req.params.dealId);
    const parsed = updateDealSchema.parse(req.body);

    const result = await updateDeal({
      ownerId: userId,
      dealId,
      pipelineId: parsed.pipelineId,
      stageId: parsed.stageId,
      title: parsed.title,
      amount: parsed.amount,
      contactId: parsed.contactId,
      expectedCloseDate: parsed.expectedCloseDate,
      updatedBy: userId,
    });

    if (result.status === 'deal_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Deal not found',
      });
    }
    if (result.status === 'pipeline_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Pipeline not found',
      });
    }
    if (result.status === 'invalid_stage_for_pipeline') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Stage does not belong to this pipeline',
      });
    }
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
      message: 'Deal updated successfully',
      data: result.deal,
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
      message: 'Failed to update deal',
      details: (error as Error).message,
    });
  }
};

export const deleteDealHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const dealId = objectIdSchema.parse(req.params.dealId);
    const result = await deleteDeal(userId, dealId, userId);

    if (result.status === 'deal_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Deal not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Deal deleted successfully',
      data: result.deal,
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
      message: 'Failed to delete deal',
      details: (error as Error).message,
    });
  }
};

export const markDealWonHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = dealActionSchema.parse(req.body);
    const dealId = parsed.dealId;
    const result = await markDealWon(userId, dealId, userId);

    if (result.status === 'deal_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Deal not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Deal marked as won',
      data: result.deal,
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
      message: 'Failed to mark deal as won',
      details: (error as Error).message,
    });
  }
};

export const markDealLostHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = dealLostActionSchema.parse(req.body);
    const result = await markDealLost(userId, parsed.dealId, userId, parsed.lostReason ?? null);

    if (result.status === 'deal_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Deal not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Deal marked as lost',
      data: result.deal,
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
      message: 'Failed to mark deal as lost',
      details: (error as Error).message,
    });
  }
};
