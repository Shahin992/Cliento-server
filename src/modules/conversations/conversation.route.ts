import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddlewares';
import {
  createConversationHandler,
  listConversationsHandler,
} from './conversation.controller';

const router = Router();
const CONVERSATION_ACCESS_ROLES = ['OWNER', 'ADMIN', 'MEMBER'];

/**
 * @swagger
 * /api/conversations:
 *   post:
 *     tags:
 *       - Conversations
 *     summary: Create a conversation entry
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - method
 *               - direction
 *             properties:
 *               contactId:
 *                 type: string
 *                 nullable: true
 *               mailboxId:
 *                 type: string
 *                 nullable: true
 *               method:
 *                 type: string
 *                 enum: [email, sms]
 *               direction:
 *                 type: string
 *                 enum: [incoming, outgoing]
 *               subject:
 *                 type: string
 *                 nullable: true
 *               body:
 *                 type: string
 *                 nullable: true
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *               externalMessageId:
 *                 type: string
 *                 nullable: true
 *               externalThreadId:
 *                 type: string
 *                 nullable: true
 *               sentAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Conversation created successfully
 */
router.post('/', authenticate, authorize(CONVERSATION_ACCESS_ROLES), createConversationHandler);

/**
 * @swagger
 * /api/conversations:
 *   get:
 *     tags:
 *       - Conversations
 *     summary: List conversations
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
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversations fetched successfully
 */
router.get('/', authenticate, authorize(CONVERSATION_ACCESS_ROLES), listConversationsHandler);

export default router;
