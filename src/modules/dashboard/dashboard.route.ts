import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddlewares';
import { getDashboardOverviewHandler } from './dashboard.controller';

const router = Router();

/**
 * @swagger
 * /api/dashboard/overview:
 *   get:
 *     tags:
 *       - Dashboard
 *     summary: Get dashboard overview data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: recentLimit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 5
 *         description: Number of recent items to return for deals, contacts, and tasks
 *     responses:
 *       200:
 *         description: Dashboard overview fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/overview', authenticate, getDashboardOverviewHandler);

export default router;
