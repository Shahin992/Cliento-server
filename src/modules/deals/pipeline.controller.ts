import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import {
  addPipelineStage,
  createPipeline,
  deletePipeline,
  getPipelineById,
  getPipelineStages,
  listPipelines,
  updatePipeline,
} from './pipeline.service';

const LENGTH = {
  pipelineName: 80,
  stageName: 50,
  stageColor: 20,
  stagesMax: 30,
} as const;

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const optionalNullableTrimmedString = (max: number) => z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  z.string().max(max).nullable().optional()
);

const createPipelineStageSchema = z.object({
  name: z.string().trim().min(1).max(LENGTH.stageName),
  color: optionalNullableTrimmedString(LENGTH.stageColor),
});

const createStageSchema = z.object({
  name: z.string().trim().min(1).max(LENGTH.stageName),
  color: optionalNullableTrimmedString(LENGTH.stageColor),
  order: z.coerce.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
});

const createPipelineSchema = z.object({
  name: z.string().trim().min(1).max(LENGTH.pipelineName),
  stages: z.array(createPipelineStageSchema).min(1).max(LENGTH.stagesMax),
}).superRefine((data, ctx) => {
  const stageNames = new Set<string>();

  data.stages.forEach((stage, index) => {
    const normalized = stage.name.trim().toLowerCase();
    if (stageNames.has(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stages', index, 'name'],
        message: 'Stage names must be unique',
      });
    }
    stageNames.add(normalized);
  });
});

const createStageOnlySchema = createStageSchema;
const updatePipelineSchema = z.object({
  name: z.string().trim().min(1).max(LENGTH.pipelineName).optional(),
  isDefault: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});
const deletePipelineSchema = z.object({
  dealAction: z.enum(['move', 'delete']),
  targetPipelineId: objectIdSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.dealAction === 'move' && !data.targetPipelineId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetPipelineId'],
      message: 'targetPipelineId is required when dealAction is move',
    });
  }
});
const listPipelinesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(10),
  search: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(LENGTH.pipelineName).optional()
  ),
});

const getUserIdFromReq = (req: Request) => (req as any).user?.id as string | undefined;
const getQueryValue = (value: unknown) => (typeof value === 'string' ? value : undefined);

export const createPipelineHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = createPipelineSchema.parse(req.body);

    const result = await createPipeline({
      ownerId: userId,
      name: parsed.name,
      stages: parsed.stages,
      createdBy: userId,
      updatedBy: userId,
    });

    if (result.status === 'duplicate_pipeline_name') {
      return sendError(res, {
        success: false,
        statusCode: 409,
        message: 'Pipeline name already exists',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 201,
      message: 'Pipeline created successfully',
      data: result.pipeline,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to create pipeline',
      details: (error as Error).message,
    });
  }
};

export const addPipelineStageHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const pipelineId = objectIdSchema.parse(req.params.pipelineId);
    const parsed = createStageOnlySchema.parse(req.body);

    const result = await addPipelineStage({
      ownerId: userId,
      pipelineId,
      name: parsed.name,
      color: parsed.color ?? null,
      order: parsed.order,
      isDefault: parsed.isDefault,
      updatedBy: userId,
    });

    if (result.status === 'pipeline_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Pipeline not found',
      });
    }
    if (result.status === 'duplicate_stage_name') {
      return sendError(res, {
        success: false,
        statusCode: 409,
        message: 'Stage name already exists in this pipeline',
      });
    }
    if (result.status === 'duplicate_stage_order') {
      return sendError(res, {
        success: false,
        statusCode: 409,
        message: 'Stage order already exists in this pipeline',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 201,
      message: 'Stage added successfully',
      data: result.pipeline,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to add stage',
      details: (error as Error).message,
    });
  }
};

export const listPipelinesHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const query = listPipelinesQuerySchema.parse({
      page: getQueryValue(req.query.page),
      limit: getQueryValue(req.query.limit),
      search: getQueryValue(req.query.search) ?? getQueryValue(req.query.q),
    });

    const pipelines = await listPipelines(userId, query);
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Pipelines fetched successfully',
      data: pipelines,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to fetch pipelines',
      details: (error as Error).message,
    });
  }
};

export const getPipelineByIdHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const pipelineId = objectIdSchema.parse(req.params.pipelineId);
    const result = await getPipelineById(userId, pipelineId);

    if (result.status === 'pipeline_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Pipeline not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Pipeline fetched successfully',
      data: result.pipeline,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to fetch pipeline',
      details: (error as Error).message,
    });
  }
};

export const getPipelineStagesHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const pipelineId = objectIdSchema.parse(req.params.pipelineId);
    const result = await getPipelineStages(userId, pipelineId);

    if (result.status === 'pipeline_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Pipeline not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Pipeline stages fetched successfully',
      data: result.pipeline,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to fetch pipeline stages',
      details: (error as Error).message,
    });
  }
};

export const updatePipelineHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const pipelineId = objectIdSchema.parse(req.params.pipelineId);
    const parsed = updatePipelineSchema.parse(req.body);

    const result = await updatePipeline({
      ownerId: userId,
      pipelineId,
      name: parsed.name,
      isDefault: parsed.isDefault,
      updatedBy: userId,
    });

    if (result.status === 'pipeline_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Pipeline not found',
      });
    }
    if (result.status === 'duplicate_pipeline_name') {
      return sendError(res, {
        success: false,
        statusCode: 409,
        message: 'Pipeline name already exists',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Pipeline updated successfully',
      data: result.pipeline,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to update pipeline',
      details: (error as Error).message,
    });
  }
};

export const deletePipelineHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const pipelineId = objectIdSchema.parse(req.params.pipelineId);
    const parsed = deletePipelineSchema.parse(req.body);
    const result = await deletePipeline({
      ownerId: userId,
      pipelineId,
      deletedBy: userId,
      dealAction: parsed.dealAction,
      targetPipelineId: parsed.targetPipelineId,
    });

    if (result.status === 'pipeline_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Pipeline not found',
      });
    }
    if (result.status === 'target_pipeline_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Target pipeline not found',
      });
    }
    if (result.status === 'invalid_target_pipeline') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'targetPipelineId must be a different pipeline',
      });
    }
    if (result.status === 'target_pipeline_has_no_stages') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Target pipeline has no stages',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Pipeline deleted successfully',
      data: {
        pipeline: result.pipeline,
        dealsAffected: result.dealsAffected,
        dealAction: result.dealAction,
        targetPipelineId: result.targetPipelineId,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to delete pipeline',
      details: (error as Error).message,
    });
  }
};
