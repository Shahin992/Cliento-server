import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddlewares';
import {
  createCheckoutSessionHandler,
  createBillingPackageHandler,
  deactivateBillingPackageHandler,
  deleteBillingPackageHandler,
  getStripeCheckoutSessionSummaryHandler,
  listPublicBillingPackagesHandler,
  updateBillingPackageHandler,
} from './package.controller';

const router = Router();
const PACKAGE_ACCESS_ROLES = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MEMBER'];

/**
 * @swagger
 * /api/packages/public:
 *   post:
 *     tags:
 *       - Packages
 *     summary: List active billing packages with optional filters (public)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planType:
 *                 type: string
 *                 nullable: true
 *                 enum: [trial, paid]
 *               billingCycle:
 *                 type: string
 *                 nullable: true
 *                 enum: [monthly, yearly]
 *     responses:
 *       200:
 *         description: Billing packages fetched successfully
 */
router.post('/public', listPublicBillingPackagesHandler);
router.get('/public', listPublicBillingPackagesHandler);

/**
 * @swagger
 * /api/packages/checkout-session/{sessionId}:
 *   get:
 *     tags:
 *       - Packages
 *     summary: Fetch Stripe checkout session summary by session id (public)
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Stripe Checkout Session id (cs_test_... or cs_live_...)
 *     responses:
 *       200:
 *         description: Stripe checkout session fetched successfully
 *       400:
 *         description: Invalid session id
 *       502:
 *         description: Stripe request failed
 */
router.get('/checkout-session/:sessionId', getStripeCheckoutSessionSummaryHandler);

/**
 * @swagger
 * /api/packages/checkout-session:
 *   post:
 *     tags:
 *       - Packages
 *     summary: Create Stripe Checkout Session for selected package (authenticated)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - packageId
 *             properties:
 *               packageId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Stripe checkout session created successfully
 *       400:
 *         description: Validation failed or package inactive
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Package not found
 *       502:
 *         description: Stripe request failed
 */
router.post('/checkout-session', authenticate, authorize(PACKAGE_ACCESS_ROLES), createCheckoutSessionHandler);

/**
 * @swagger
 * /api/packages:
 *   post:
 *     tags:
 *       - Packages
 *     summary: Create a billing package in Stripe and store in DB (SUPER_ADMIN only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - name
 *               - billingCycle
 *               - price
 *             properties:
 *               code:
 *                 type: string
 *                 example: pro
 *               name:
 *                 type: string
 *                 example: Pro Plan
 *               description:
 *                 type: string
 *                 nullable: true
 *               billingCycle:
 *                 type: string
 *                 enum: [monthly, yearly]
 *               hasTrial:
 *                 type: boolean
 *                 default: true
 *               trialPeriodDays:
 *                 type: integer
 *                 default: 14
 *               price:
 *                 type: object
 *                 required: true
 *                 properties:
 *                   amount:
 *                     type: number
 *                   currency:
 *                     type: string
 *                     enum: [usd, eur, gbp, bdt]
 *               limits:
 *                 type: object
 *                 properties:
 *                   users:
 *                     type: integer
 *                     nullable: true
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *               isActive:
 *                 type: boolean
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Billing package created successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (SUPER_ADMIN only)
 *       409:
 *         description: Package code already exists
 *       502:
 *         description: Stripe package creation failed
 */
router.post('/', authenticate, authorize(['SUPER_ADMIN']), createBillingPackageHandler);

/**
 * @swagger
 * /api/packages/{packageId}:
 *   put:
 *     tags:
 *       - Packages
 *     summary: Update a billing package in Stripe and DB (SUPER_ADMIN only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Billing package id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - name
 *               - billingCycle
 *               - price
 *             properties:
 *               code:
 *                 type: string
 *                 example: pro
 *               name:
 *                 type: string
 *                 example: Pro Plan
 *               description:
 *                 type: string
 *                 nullable: true
 *               billingCycle:
 *                 type: string
 *                 enum: [monthly, yearly]
 *               hasTrial:
 *                 type: boolean
 *                 default: true
 *               trialPeriodDays:
 *                 type: integer
 *                 default: 14
 *               price:
 *                 type: object
 *                 properties:
 *                   amount:
 *                     type: number
 *                   currency:
 *                     type: string
 *                     enum: [usd, eur, gbp, bdt]
 *               limits:
 *                 type: object
 *                 properties:
 *                   users:
 *                     type: integer
 *                     nullable: true
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *               isActive:
 *                 type: boolean
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Billing package updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (SUPER_ADMIN only)
 *       404:
 *         description: Package not found
 *       409:
 *         description: Package code already exists
 *       502:
 *         description: Stripe request failed
 */
router.put('/:packageId', authenticate, authorize(['SUPER_ADMIN']), updateBillingPackageHandler);

/**
 * @swagger
 * /api/packages/deactivate/{packageId}:
 *   patch:
 *     tags:
 *       - Packages
 *     summary: Deactivate a billing package (SUPER_ADMIN only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Billing package id
 *     responses:
 *       200:
 *         description: Billing package deactivated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (SUPER_ADMIN only)
 *       404:
 *         description: Package not found
 *       502:
 *         description: Stripe request failed
 */
router.patch('/deactivate/:packageId', authenticate, authorize(['SUPER_ADMIN']), deactivateBillingPackageHandler);

/**
 * @swagger
 * /api/packages/{packageId}:
 *   delete:
 *     tags:
 *       - Packages
 *     summary: Delete a billing package (SUPER_ADMIN only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Billing package id
 *     responses:
 *       200:
 *         description: Billing package deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (SUPER_ADMIN only)
 *       404:
 *         description: Package not found
 *       502:
 *         description: Stripe request failed
 */
router.delete('/:packageId', authenticate, authorize(['SUPER_ADMIN']), deleteBillingPackageHandler);

export default router;
