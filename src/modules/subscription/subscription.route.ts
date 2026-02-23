import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddlewares';
import {
  getCurrentSubscriptionHandler,
  getSubscriptionByIdHandler,
  listSubscriptionsHandler,
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
