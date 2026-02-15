import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddlewares';
import {
  createDealHandler,
  deleteDealHandler,
  getDealDetailsHandler,
  listContactDealsHandler,
  listDealsHandler,
  markDealLostHandler,
  markDealWonHandler,
  updateDealHandler,
} from './deal.controller';

const router = Router();
const DEAL_ACCESS_ROLES = ['OWNER', 'ADMIN', 'MEMBER'];

/**
 * @swagger
 * /api/deals:
 *   post:
 *     tags:
 *       - Deals
 *     summary: Create a deal
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ownerId
 *               - pipelineId
 *               - stageId
 *               - title
 *             properties:
 *               ownerId:
 *                 type: string
 *               pipelineId:
 *                 type: string
 *               stageId:
 *                 type: string
 *               title:
 *                 type: string
 *               amount:
 *                 type: number
 *                 nullable: true
 *               contactId:
 *                 type: string
 *                 nullable: true
 *               expectedCloseDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Deal created successfully
 *       400:
 *         description: Validation failed or invalid stage
 *       404:
 *         description: Pipeline or contact not found
 */
router.post('/', authenticate, authorize(DEAL_ACCESS_ROLES), createDealHandler);

/**
 * @swagger
 * /api/deals:
 *   get:
 *     tags:
 *       - Deals
 *     summary: List deals
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
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by deal title
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, won, lost]
 *       - in: query
 *         name: pipelineId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deals fetched successfully
 */
router.get('/', authenticate, authorize(DEAL_ACCESS_ROLES), listDealsHandler);

/**
 * @swagger
 * /api/deals/contact/{contactId}:
 *   get:
 *     tags:
 *       - Deals
 *     summary: List deals for a contact
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
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
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by deal title
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, won, lost]
 *     responses:
 *       200:
 *         description: Contact deals fetched successfully
 *       404:
 *         description: Contact not found
 */
router.get('/contact/:contactId', authenticate, authorize(DEAL_ACCESS_ROLES), listContactDealsHandler);

/**
 * @swagger
 * /api/deals/{dealId}:
 *   get:
 *     tags:
 *       - Deals
 *     summary: Get deal details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deal fetched successfully
 *       404:
 *         description: Deal not found
 */
router.get('/:dealId', authenticate, authorize(DEAL_ACCESS_ROLES), getDealDetailsHandler);

/**
 * @swagger
 * /api/deals/{dealId}:
 *   put:
 *     tags:
 *       - Deals
 *     summary: Update deal
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pipelineId:
 *                 type: string
 *               stageId:
 *                 type: string
 *               title:
 *                 type: string
 *               amount:
 *                 type: number
 *                 nullable: true
 *               contactId:
 *                 type: string
 *                 nullable: true
 *               expectedCloseDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Deal updated successfully
 *       404:
 *         description: Deal not found
 */
router.put('/:dealId', authenticate, authorize(DEAL_ACCESS_ROLES), updateDealHandler);

/**
 * @swagger
 * /api/deals/{dealId}:
 *   delete:
 *     tags:
 *       - Deals
 *     summary: Delete deal
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deal deleted successfully
 *       404:
 *         description: Deal not found
 */
router.delete('/:dealId', authenticate, authorize(DEAL_ACCESS_ROLES), deleteDealHandler);

/**
 * @swagger
 * /api/deals/won:
 *   post:
 *     tags:
 *       - Deals
 *     summary: Mark deal as won
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dealId
 *             properties:
 *               dealId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Deal marked as won
 *       404:
 *         description: Deal not found
 */
router.post('/won', authenticate, authorize(DEAL_ACCESS_ROLES), markDealWonHandler);

/**
 * @swagger
 * /api/deals/lost:
 *   post:
 *     tags:
 *       - Deals
 *     summary: Mark deal as lost
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dealId
 *             properties:
 *               dealId:
 *                 type: string
 *               lostReason:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Deal marked as lost
 *       404:
 *         description: Deal not found
 */
router.post('/lost', authenticate, authorize(DEAL_ACCESS_ROLES), markDealLostHandler);

export default router;
