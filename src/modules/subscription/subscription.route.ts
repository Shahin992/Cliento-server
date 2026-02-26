import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddlewares';
import {
  attachPaymentMethodToCurrentSubscriptionHandler,
  createSetupIntentForCurrentSubscriptionHandler,
  deletePaymentMethodFromCurrentSubscriptionHandler,
  getCurrentSubscriptionHandler,
  getSubscriptionByIdHandler,
  listSubscriptionsHandler,
  setDefaultPaymentMethodForCurrentSubscriptionHandler,
  syncSubscriptionFromCheckoutSessionHandler,
} from './subscription.controller';

const router = Router();
const SUBSCRIPTION_ACCESS_ROLES = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MEMBER'];

/**
 * @swagger
 * /api/subscriptions/me/current:
 *   get:
 *     tags:
 *       - Subscriptions
 *     summary: Get current subscription for authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Current subscription not found
 */
router.get('/me/current', authenticate, authorize(SUBSCRIPTION_ACCESS_ROLES), getCurrentSubscriptionHandler);

/**
 * @swagger
 * /api/subscriptions/me/history:
 *   get:
 *     tags:
 *       - Subscriptions
 *     summary: List subscription history for authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Subscriptions fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/me/history', authenticate, authorize(SUBSCRIPTION_ACCESS_ROLES), listSubscriptionsHandler);

/**
 * @swagger
 * /api/subscriptions/me/setup-intent:
 *   post:
 *     tags:
 *       - Subscriptions
 *     summary: Create Stripe setup intent for current subscription
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Setup intent created
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Current subscription not found
 *       502:
 *         description: Stripe request failed
 */
router.post(
  '/me/setup-intent',
  authenticate,
  authorize(SUBSCRIPTION_ACCESS_ROLES),
  createSetupIntentForCurrentSubscriptionHandler
);

/**
 * @swagger
 * /api/subscriptions/me/payment-method:
 *   post:
 *     tags:
 *       - Subscriptions
 *     summary: Attach a payment method to current subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethodId
 *             properties:
 *               paymentMethodId:
 *                 type: string
 *                 example: pm_123456789
 *     responses:
 *       200:
 *         description: Payment method attached successfully
 *       400:
 *         description: Validation failed or invalid payment method
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Current subscription not found
 *       502:
 *         description: Stripe request failed
 */
router.post(
  '/me/payment-method',
  authenticate,
  authorize(SUBSCRIPTION_ACCESS_ROLES),
  attachPaymentMethodToCurrentSubscriptionHandler
);

/**
 * @swagger
 * /api/subscriptions/me/make-default-card:
 *   post:
 *     tags:
 *       - Subscriptions
 *     summary: Set default card for current subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethodId
 *             properties:
 *               paymentMethodId:
 *                 type: string
 *                 example: pm_123456789
 *     responses:
 *       200:
 *         description: Default payment method updated successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Current subscription or card not found
 *       502:
 *         description: Stripe request failed
 */
router.post(
  '/me/make-default-card',
  authenticate,
  authorize(SUBSCRIPTION_ACCESS_ROLES),
  setDefaultPaymentMethodForCurrentSubscriptionHandler
);

/**
 * @swagger
 * /api/subscriptions/me/remove-card:
 *   post:
 *     tags:
 *       - Subscriptions
 *     summary: Remove a saved card from current subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethodId
 *             properties:
 *               paymentMethodId:
 *                 type: string
 *                 example: pm_123456789
 *     responses:
 *       200:
 *         description: Payment method deleted successfully
 *       400:
 *         description: Validation failed or cannot delete last saved card
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Current subscription or card not found
 *       502:
 *         description: Stripe request failed
 */
router.post(
  '/me/remove-card',
  authenticate,
  authorize(SUBSCRIPTION_ACCESS_ROLES),
  deletePaymentMethodFromCurrentSubscriptionHandler
);

/**
 * @swagger
 * /api/subscriptions/sync/checkout-session:
 *   post:
 *     tags:
 *       - Subscriptions
 *     summary: Sync subscription from successful Stripe checkout session
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *             properties:
 *               sessionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscription synced successfully
 *       400:
 *         description: Checkout/payment not successful or missing required ids
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Package not found
 *       502:
 *         description: Stripe request failed
 */
router.post('/sync/checkout-session', authenticate, authorize(SUBSCRIPTION_ACCESS_ROLES), syncSubscriptionFromCheckoutSessionHandler);
                                                      
/**
 * @swagger
 * /api/subscriptions/{subscriptionId}:
 *   get:
 *     tags:
 *       - Subscriptions
 *     summary: Get subscription details by id (owned by authenticated user)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Subscription fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Subscription not found
 */
router.get('/:subscriptionId', authenticate, authorize(SUBSCRIPTION_ACCESS_ROLES), getSubscriptionByIdHandler);

export default router;
