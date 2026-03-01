import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import { getDashboardOverview } from './dashboard.service';

const querySchema = z.object({
  recentLimit: z.coerce.number().int().min(1).max(20).default(5),
});

const getUserIdFromReq = (req: Request) => (req as any).user?.id as string | undefined;
const getQueryValue = (value: unknown) => (typeof value === 'string' ? value : undefined);

export const getDashboardOverviewHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const query = querySchema.parse({
      recentLimit: getQueryValue(req.query.recentLimit),
    });

    const data = await getDashboardOverview(userId, query.recentLimit);

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Dashboard overview fetched successfully',
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
      message: 'Failed to fetch dashboard overview',
      details: (error as Error).message,
    });
  }
};
