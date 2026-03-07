import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddlewares';
import {
  createTagHandler,
  deleteTagHandler,
  getTagByIdHandler,
  listTagsHandler,
  updateTagHandler,
} from './tags.controller';
const router = Router();
const TAG_ACCESS_ROLES = ['OWNER', 'ADMIN', 'MEMBER'];

/**
 * @swagger
 * /api/tags:
 *   post:
 *     tags:
 *       - Tags
 *     summary: Create a tag
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
 *             properties:
 *               name:
 *                 type: string
 *               color:
 *                 type: string
 *                 nullable: true
 *                 example: '#2563eb'
 *               description:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Tag created successfully
 */
router.post('/', authenticate, authorize(TAG_ACCESS_ROLES), createTagHandler);

/**
 * @swagger
 * /api/tags:
 *   get:
 *     tags:
 *       - Tags
 *     summary: List tags
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
 *         description: Tags fetched successfully
 */
router.get('/', authenticate, authorize(TAG_ACCESS_ROLES), listTagsHandler);

/**
 * @swagger
 * /api/tags/{tagId}:
 *   get:
 *     tags:
 *       - Tags
 *     summary: Get tag by id
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tagId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tag fetched successfully
 *       404:
 *         description: Tag not found
 */
router.get('/:tagId', authenticate, authorize(TAG_ACCESS_ROLES), getTagByIdHandler);

/**
 * @swagger
 * /api/tags/{tagId}:
 *   put:
 *     tags:
 *       - Tags
 *     summary: Update tag
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tagId
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
 *               name:
 *                 type: string
 *               color:
 *                 type: string
 *                 nullable: true
 *                 example: '#2563eb'
 *               description:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Tag updated successfully
 *       404:
 *         description: Tag not found
 */
router.put('/:tagId', authenticate, authorize(TAG_ACCESS_ROLES), updateTagHandler);

/**
 * @swagger
 * /api/tags/{tagId}:
 *   delete:
 *     tags:
 *       - Tags
 *     summary: Delete tag
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tagId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tag deleted successfully
 *       404:
 *         description: Tag not found
 */
router.delete('/:tagId', authenticate, authorize(TAG_ACCESS_ROLES), deleteTagHandler);

export default router;
