import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddlewares';
import {
  createTaskHandler,
  deleteTaskHandler,
  getTaskDetailsHandler,
  listTasksHandler,
  updateTaskHandler,
} from './task.controller';

const router = Router();
const TASK_ACCESS_ROLES = ['OWNER', 'ADMIN', 'MEMBER'];

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     tags:
 *       - Tasks
 *     summary: Create a task
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [todo, in_progress, done]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               assignedTo:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Task created successfully
 */
router.post('/', authenticate, authorize(TASK_ACCESS_ROLES), createTaskHandler);

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     tags:
 *       - Tasks
 *     summary: List tasks
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [todo, in_progress, done]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high]
 *       - in: query
 *         name: assignedTo
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tasks fetched successfully
 */
router.get('/', authenticate, authorize(TASK_ACCESS_ROLES), listTasksHandler);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Get task details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task fetched successfully
 *       404:
 *         description: Task not found
 */
router.get('/:taskId', authenticate, authorize(TASK_ACCESS_ROLES), getTaskDetailsHandler);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   put:
 *     tags:
 *       - Tasks
 *     summary: Update task
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [todo, in_progress, done]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               assignedTo:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Task updated successfully
 *       404:
 *         description: Task not found
 */
router.put('/:taskId', authenticate, authorize(TASK_ACCESS_ROLES), updateTaskHandler);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   delete:
 *     tags:
 *       - Tasks
 *     summary: Delete task
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task deleted successfully
 *       404:
 *         description: Task not found
 */
router.delete('/:taskId', authenticate, authorize(TASK_ACCESS_ROLES), deleteTaskHandler);

export default router;
