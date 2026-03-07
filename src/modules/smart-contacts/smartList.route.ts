import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddlewares';
import {
  createContactListHandler,
  deleteContactListHandler,
  getContactListByIdHandler,
  listContactListsHandler,
  updateContactListHandler,
} from './smartList.controller';

const router = Router();
const CONTACT_LIST_ACCESS_ROLES = ['OWNER', 'ADMIN', 'MEMBER'];

/**
 * @swagger
 * /api/smart-lists:
 *   post:
 *     tags:
 *       - Smart Lists
 *     summary: Create a smart list
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - contactIds
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               contactIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Smart list created successfully
 */
router.post('/', authenticate, authorize(CONTACT_LIST_ACCESS_ROLES), createContactListHandler);

/**
 * @swagger
 * /api/smart-lists:
 *   get:
 *     tags:
 *       - Smart Lists
 *     summary: List smart lists
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
 *     responses:
 *       200:
 *         description: Smart lists fetched successfully
 */
router.get('/', authenticate, authorize(CONTACT_LIST_ACCESS_ROLES), listContactListsHandler);

/**
 * @swagger
 * /api/smart-lists/{listId}:
 *   get:
 *     tags:
 *       - Smart Lists
 *     summary: Get smart list by id
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: listId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Smart list fetched successfully
 *       404:
 *         description: Smart list not found
 */
router.get('/:listId', authenticate, authorize(CONTACT_LIST_ACCESS_ROLES), getContactListByIdHandler);

/**
 * @swagger
 * /api/smart-lists/{listId}:
 *   put:
 *     tags:
 *       - Smart Lists
 *     summary: Update smart list
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: listId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - contactIds
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               contactIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Smart list updated successfully
 *       404:
 *         description: Smart list not found
 */
router.put('/:listId', authenticate, authorize(CONTACT_LIST_ACCESS_ROLES), updateContactListHandler);

/**
 * @swagger
 * /api/smart-lists/{listId}:
 *   delete:
 *     tags:
 *       - Smart Lists
 *     summary: Delete smart list
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: listId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Smart list deleted successfully
 *       404:
 *         description: Smart list not found
 */
router.delete('/:listId', authenticate, authorize(CONTACT_LIST_ACCESS_ROLES), deleteContactListHandler);

export default router;
