import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import {
  attachPaymentMethodToCurrentSubscription,
  createSetupIntentForCurrentSubscription,
  deletePaymentMethodFromCurrentSubscription,
  getCurrentSubscription,
  getSubscriptionById,
  listSubscriptions,
  setDefaultPaymentMethodForCurrentSubscription,
  syncSubscriptionFromCheckoutSession,
} from './subscription.service';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const stripeCheckoutSessionIdSchema = z
  .string()
  .trim()
  .regex(/^cs_(test|live)_[A-Za-z0-9]+$/, 'Invalid Stripe checkout session id');
const syncCheckoutSessionBodySchema = z.object({
  sessionId: stripeCheckoutSessionIdSchema,
});
const attachPaymentMethodBodySchema = z.object({
  paymentMethodId: z
    .string()
    .trim()
    .regex(/^pm_[A-Za-z0-9]+$/, 'Invalid Stripe payment method id'),
});
const paymentMethodIdBodySchema = z.object({
  paymentMethodId: z
    .string()
    .trim()
    .regex(/^pm_[A-Za-z0-9]+$/, 'Invalid Stripe payment method id'),
});

const listSubscriptionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(10),
});

const getUserIdFromReq = (req: Request) => (req as any).user?.id as string | undefined;
const getQueryValue = (value: unknown) => (typeof value === 'string' ? value : undefined);

export const getCurrentSubscriptionHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const result = await getCurrentSubscription(userId);
    if (result.status === 'not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Current subscription not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Current subscription fetched successfully',
      data: result.subscription,
    });
  } catch (error) {
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to fetch current subscription',
      details: (error as Error).message,
    });
  }
};

export const getSubscriptionByIdHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const subscriptionId = objectIdSchema.parse(req.params.subscriptionId);
    const result = await getSubscriptionById(userId, subscriptionId);
    if (result.status === 'not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Subscription not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Subscription fetched successfully',
      data: result.subscription,
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
      message: 'Failed to fetch subscription',
      details: (error as Error).message,
    });
  }
};

export const listSubscriptionsHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const query = listSubscriptionsQuerySchema.parse({
      page: getQueryValue(req.query.page),
      limit: getQueryValue(req.query.limit),
    });

    const result = await listSubscriptions(userId, query);

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Subscriptions fetched successfully',
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
      message: 'Failed to fetch subscriptions',
      details: (error as Error).message,
    });
  }
};

export const createSetupIntentForCurrentSubscriptionHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const result = await createSetupIntentForCurrentSubscription(userId);
    if (result.status === 'not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Current subscription not found',
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

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Setup intent created',
      data: {
        clientSecret: result.clientSecret,
      },
    });
  } catch (error) {
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to create setup intent',
      details: (error as Error).message,
    });
  }
};

export const attachPaymentMethodToCurrentSubscriptionHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsedBody = attachPaymentMethodBodySchema.parse(req.body);
    const result = await attachPaymentMethodToCurrentSubscription(userId, parsedBody.paymentMethodId);

    if (result.status === 'not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Current subscription not found',
      });
    }
    if (result.status === 'customer_id_missing') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Subscription has no Stripe customer id',
      });
    }
    if (result.status === 'invalid_payment_method') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Payment method must be a card',
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

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Payment method attached successfully',
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
      message: 'Failed to attach payment method',
      details: (error as Error).message,
    });
  }
};

export const setDefaultPaymentMethodForCurrentSubscriptionHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsedBody = paymentMethodIdBodySchema.parse(req.body);
    const result = await setDefaultPaymentMethodForCurrentSubscription(
      userId,
      parsedBody.paymentMethodId
    );

    if (result.status === 'not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Current subscription not found',
      });
    }
    if (result.status === 'customer_id_missing') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Subscription has no Stripe customer id',
      });
    }
    if (result.status === 'card_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Card not found in current subscription',
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

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Default payment method updated successfully',
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
      message: 'Failed to update default payment method',
      details: (error as Error).message,
    });
  }
};

export const deletePaymentMethodFromCurrentSubscriptionHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsedBody = paymentMethodIdBodySchema.parse(req.body);
    const result = await deletePaymentMethodFromCurrentSubscription(
      userId,
      parsedBody.paymentMethodId
    );

    if (result.status === 'not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Current subscription not found',
      });
    }
    if (result.status === 'customer_id_missing') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Subscription has no Stripe customer id',
      });
    }
    if (result.status === 'card_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Card not found in current subscription',
      });
    }
    if (result.status === 'cannot_delete_last_card') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Cannot delete the last saved card',
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

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Payment method deleted successfully',
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
      message: 'Failed to delete payment method',
      details: (error as Error).message,
    });
  }
};

export const syncSubscriptionFromCheckoutSessionHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsedBody = syncCheckoutSessionBodySchema.parse(req.body);
    const sessionId = parsedBody.sessionId;
    const result = await syncSubscriptionFromCheckoutSession(userId, sessionId);

    if (result.status === 'checkout_not_completed') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Checkout is not completed yet',
      });
    }
    if (result.status === 'payment_not_successful') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Payment is not successful yet',
      });
    }
    if (result.status === 'subscription_id_missing') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Session has no subscription id',
      });
    }
    if (result.status === 'customer_id_missing') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Session has no customer id',
      });
    }
    if (result.status === 'price_id_missing') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Session has no price id',
      });
    }
    if (result.status === 'checkout_user_mismatch') {
      return sendError(res, {
        success: false,
        statusCode: 403,
        message: 'This checkout session does not belong to the authenticated user',
      });
    }
    if (result.status === 'package_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Package not found for this checkout session',
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

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Subscription synced successfully',
      data: result.subscription,
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
      message: 'Failed to sync subscription',
      details: (error as Error).message,
    });
  }
};
