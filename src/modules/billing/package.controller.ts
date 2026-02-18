import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import {
  createBillingPackage,
  deactivateBillingPackage,
  deleteBillingPackage,
  listPublicBillingPackages,
  updateBillingPackage,
} from './package.service';

const TEXT_LENGTH = {
  code: 40,
  name: 80,
  description: 500,
  feature: 100,
  featureMaxItems: 50,
} as const;

const optionalNullableTrimmedString = (max: number) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return null;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    },
    z.string().max(max).nullable()
  );

const optionalNullableIntegerLimit = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return null;
    return value;
  },
  z.coerce.number().int().min(1).nullable()
);

const priceSchema = z.object({
  amount: z.coerce.number().positive(),
  currency: z.enum(['usd', 'eur', 'gbp', 'bdt']),
});
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const createPackageSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(TEXT_LENGTH.code)
    .regex(/^[a-zA-Z0-9_-]+$/, 'code may contain only letters, numbers, _ and -'),
  name: z.string().trim().min(1).max(TEXT_LENGTH.name),
  description: optionalNullableTrimmedString(TEXT_LENGTH.description).optional(),
  hasTrial: z.boolean().default(true),
  trialPeriodDays: z.coerce.number().int().min(0).max(90).optional(),
  billingCycle: z.enum(['monthly', 'yearly']),
  price: priceSchema,
  limits: z
    .object({
      users: optionalNullableIntegerLimit.optional(),
    })
    .optional(),
  features: z.array(z.string().trim().min(1).max(TEXT_LENGTH.feature)).max(TEXT_LENGTH.featureMaxItems).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.hasTrial) {
    if (data.trialPeriodDays !== undefined && data.trialPeriodDays <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trialPeriodDays'],
        message: 'trialPeriodDays must be greater than 0 when provided and hasTrial is true.',
      });
    }
  } else if (data.trialPeriodDays && data.trialPeriodDays > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['trialPeriodDays'],
      message: 'trialPeriodDays must be 0 or omitted when hasTrial is false.',
    });
  }
});
const updatePackageSchema = createPackageSchema;

const getUserIdFromReq = (req: Request) => (req as any).user?.id as string | undefined;

const handleServiceError = (res: Response, result: { status: string; message?: string }) => {
  if (result.status === 'package_not_found') {
    return sendError(res, {
      success: false,
      statusCode: 404,
      message: 'Package not found',
    });
  }
  if (result.status === 'package_code_exists') {
    return sendError(res, {
      success: false,
      statusCode: 409,
      message: 'Package code already exists',
    });
  }
  if (result.status === 'stripe_not_configured') {
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Stripe is not configured',
      details: result.message,
    });
  }
  if (result.status === 'stripe_error') {
    return sendError(res, {
      success: false,
      statusCode: 502,
      message: 'Stripe request failed',
      details: result.message,
    });
  }
  return null;
};

export const createBillingPackageHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = createPackageSchema.parse(req.body);
    const result = await createBillingPackage({
      code: parsed.code,
      name: parsed.name,
      description: parsed.description ?? null,
      hasTrial: parsed.hasTrial,
      trialPeriodDays: parsed.hasTrial ? parsed.trialPeriodDays ?? 14 : 0,
      billingCycle: parsed.billingCycle,
      price: parsed.price,
      limits: { users: parsed.limits?.users ?? null },
      features: parsed.features ?? [],
      isActive: parsed.isActive ?? true,
      isDefault: parsed.isDefault ?? false,
      createdBy: userId,
      updatedBy: userId,
    });

    const serviceError = handleServiceError(res, result);
    if (serviceError) return serviceError;

    return sendResponse(res, {
      success: true,
      statusCode: 201,
      message: 'Billing package created successfully',
      data: result.package,
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
      message: 'Failed to create billing package',
      details: (error as Error).message,
    });
  }
};

export const updateBillingPackageHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const packageId = objectIdSchema.parse(req.params.packageId);
    const parsed = updatePackageSchema.parse(req.body);

    const result = await updateBillingPackage({
      packageId,
      code: parsed.code,
      name: parsed.name,
      description: parsed.description ?? null,
      hasTrial: parsed.hasTrial,
      trialPeriodDays: parsed.hasTrial ? parsed.trialPeriodDays ?? 14 : 0,
      billingCycle: parsed.billingCycle,
      price: parsed.price,
      limits: { users: parsed.limits?.users ?? null },
      features: parsed.features ?? [],
      isActive: parsed.isActive ?? true,
      isDefault: parsed.isDefault ?? false,
      updatedBy: userId,
    });

    const serviceError = handleServiceError(res, result);
    if (serviceError) return serviceError;

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Billing package updated successfully',
      data: result.package,
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
      message: 'Failed to update billing package',
      details: (error as Error).message,
    });
  }
};

export const deactivateBillingPackageHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const packageId = objectIdSchema.parse(req.params.packageId);
    const result = await deactivateBillingPackage(packageId, userId);
    const serviceError = handleServiceError(res, result);
    if (serviceError) return serviceError;

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Billing package deactivated successfully',
      data: result.package,
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
      message: 'Failed to deactivate billing package',
      details: (error as Error).message,
    });
  }
};

export const deleteBillingPackageHandler = async (req: Request, res: Response) => {
  try {
    const packageId = objectIdSchema.parse(req.params.packageId);
    const result = await deleteBillingPackage(packageId);
    const serviceError = handleServiceError(res, result);
    if (serviceError) return serviceError;

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Billing package deleted successfully',
      data: result.package,
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
      message: 'Failed to delete billing package',
      details: (error as Error).message,
    });
  }
};

export const listPublicBillingPackagesHandler = async (_req: Request, res: Response) => {
  try {
    const result = await listPublicBillingPackages();
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Billing packages fetched successfully',
      data: result,
    });
  } catch (error) {
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to fetch billing packages',
      details: (error as Error).message,
    });
  }
};
