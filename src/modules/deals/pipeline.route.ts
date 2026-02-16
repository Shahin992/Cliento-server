import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddlewares';
import {
  addPipelineStageHandler,
  createPipelineHandler,
  deletePipelineHandler,
  getPipelineByIdHandler,
  getPipelineStagesHandler,
  listPipelinesHandler,
  listPipelinesWithStagesHandler,
  updatePipelineHandler,
} from './pipeline.controller';

const router = Router();
const PIPELINE_ACCESS_ROLES = ['SUPER_ADMIN','OWNER', 'ADMIN', 'MEMBER'];

/**
 * @swagger
 * /api/pipelines:
 *   post:
 *     tags:
 *       - Pipelines
 *     summary: Create a pipeline with stages
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
 *               - stages
 *             properties:
 *               name:
 *                 type: string
 *               stages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                   properties:
 *                     name:
 *                       type: string
 *                     color:
 *                       type: string
 *                       nullable: true
 *     responses:
 *       201:
 *         description: Pipeline created successfully
 */
router.post('/', authenticate, authorize(PIPELINE_ACCESS_ROLES), createPipelineHandler);

/**
 * @swagger
 * /api/pipelines:
 *   get:
 *     tags:
 *       - Pipelines
 *     summary: List pipelines (without stages)
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
 *         description: Search by pipeline name
 *     responses:
 *       200:
 *         description: Pipelines fetched successfully
 */
router.get('/', authenticate, authorize(PIPELINE_ACCESS_ROLES), listPipelinesHandler);

/**
 * @swagger
 * /api/pipelines/with-stages:
 *   get:
 *     tags:
 *       - Pipelines
 *     summary: List pipelines with stages
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
 *         description: Search by pipeline name
 *     responses:
 *       200:
 *         description: Pipelines with stages fetched successfully
 */
router.get('/with-stages', authenticate, authorize(PIPELINE_ACCESS_ROLES), listPipelinesWithStagesHandler);

/**
 * @swagger
 * /api/pipelines/{pipelineId}/stages:
 *   post:
 *     tags:
 *       - Pipelines
 *     summary: Add stage to a pipeline
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pipelineId
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
 *             properties:
 *               name:
 *                 type: string
 *               color:
 *                 type: string
 *                 nullable: true
 *               order:
 *                 type: integer
 *               isDefault:
 *                 type: boolean
 *                 default: false
 *                 description: Defaults to false unless explicitly sent as true
 *     responses:
 *       201:
 *         description: Stage added successfully
 *       404:
 *         description: Pipeline not found
 */
router.post('/:pipelineId/stages', authenticate, authorize(PIPELINE_ACCESS_ROLES), addPipelineStageHandler);

/**
 * @swagger
 * /api/pipelines/{pipelineId}/stages:
 *   get:
 *     tags:
 *       - Pipelines
 *     summary: Get stages of a pipeline
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pipelineId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pipeline stages fetched successfully
 *       404:
 *         description: Pipeline not found
 */
router.get('/:pipelineId/stages', authenticate, authorize(PIPELINE_ACCESS_ROLES), getPipelineStagesHandler);

/**
 * @swagger
 * /api/pipelines/{pipelineId}:
 *   get:
 *     tags:
 *       - Pipelines
 *     summary: Get pipeline details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pipelineId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pipeline fetched successfully
 *       404:
 *         description: Pipeline not found
 */
router.get('/:pipelineId', authenticate, authorize(PIPELINE_ACCESS_ROLES), getPipelineByIdHandler);

/**
 * @swagger
 * /api/pipelines/{pipelineId}:
 *   put:
 *     tags:
 *       - Pipelines
 *     summary: Update pipeline
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pipelineId
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
 *               isDefault:
 *                 type: boolean
 *                 default: false
 *                 description: Defaults to false unless explicitly sent as true
 *               stages:
 *                 type: array
 *                 description: Replaces pipeline stages; supports rename, remove and add
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                   properties:
 *                     _id:
 *                       type: string
 *                       description: Existing stage id. Omit for new stage.
 *                     name:
 *                       type: string
 *                     color:
 *                       type: string
 *                       nullable: true
 *                     order:
 *                       type: integer
 *                     isDefault:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: Pipeline updated successfully
 *       404:
 *         description: Pipeline not found
 */
router.put('/:pipelineId', authenticate, authorize(PIPELINE_ACCESS_ROLES), updatePipelineHandler);

/**
 * @swagger
 * /api/pipelines/{pipelineId}:
 *   delete:
 *     tags:
 *       - Pipelines
 *     summary: Delete pipeline
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pipelineId
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
 *               - dealAction
 *             properties:
 *               dealAction:
 *                 type: string
 *                 enum: [move, delete]
 *                 description: move reassigns deals to another pipeline, delete soft-deletes related deals
 *               targetPipelineId:
 *                 type: string
 *                 description: Required when dealAction is move
 *     responses:
 *       200:
 *         description: Pipeline deleted successfully
 *       404:
 *         description: Pipeline not found
 */
router.delete('/:pipelineId', authenticate, authorize(PIPELINE_ACCESS_ROLES), deletePipelineHandler);

export default router;
