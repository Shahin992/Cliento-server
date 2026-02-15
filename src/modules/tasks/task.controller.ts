import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import { createTask, deleteTask, getTaskDetails, listTasks, updateTask } from './task.service';

const LENGTH = {
  title: 150,
  description: 2000,
} as const;

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const optionalNullableObjectIdSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  objectIdSchema.nullable()
);

const optionalNullableStringSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  z.string().max(LENGTH.description).nullable()
);

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(LENGTH.title),
  description: optionalNullableStringSchema.optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  assignedTo: optionalNullableObjectIdSchema.optional(),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(LENGTH.title).optional(),
  description: optionalNullableStringSchema.optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  assignedTo: optionalNullableObjectIdSchema.optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(10),
  search: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(LENGTH.title).optional()
  ),
  status: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim().toLowerCase();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.enum(['todo', 'in_progress', 'done']).optional()
  ),
  priority: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim().toLowerCase();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.enum(['low', 'medium', 'high']).optional()
  ),
  assignedTo: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    objectIdSchema.optional()
  ),
});

const getUserIdFromReq = (req: Request) => (req as any).user?.id as string | undefined;
const getQueryValue = (value: unknown) => (typeof value === 'string' ? value : undefined);

export const createTaskHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = createTaskSchema.parse(req.body);
    const result = await createTask({
      ownerId: userId,
      title: parsed.title,
      description: parsed.description ?? null,
      status: parsed.status,
      priority: parsed.priority,
      dueDate: parsed.dueDate ?? null,
      assignedTo: parsed.assignedTo ?? null,
      createdBy: userId,
      updatedBy: userId,
    });

    if (result.status === 'assignee_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Assigned user not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 201,
      message: 'Task created successfully',
      data: result.task,
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
      message: 'Failed to create task',
      details: (error as Error).message,
    });
  }
};

export const getTaskDetailsHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const taskId = objectIdSchema.parse(req.params.taskId);
    const result = await getTaskDetails(userId, taskId);

    if (result.status === 'task_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Task not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Task fetched successfully',
      data: result.task,
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
      message: 'Failed to fetch task',
      details: (error as Error).message,
    });
  }
};

export const listTasksHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const query = listTasksQuerySchema.parse({
      page: getQueryValue(req.query.page),
      limit: getQueryValue(req.query.limit),
      search: getQueryValue(req.query.search) ?? getQueryValue(req.query.q),
      status: getQueryValue(req.query.status),
      priority: getQueryValue(req.query.priority),
      assignedTo: getQueryValue(req.query.assignedTo),
    });

    const result = await listTasks(userId, query);

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Tasks fetched successfully',
      data: result,
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
      message: 'Failed to fetch tasks',
      details: (error as Error).message,
    });
  }
};

export const updateTaskHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const taskId = objectIdSchema.parse(req.params.taskId);
    const parsed = updateTaskSchema.parse(req.body);

    const result = await updateTask({
      ownerId: userId,
      taskId,
      title: parsed.title,
      description: parsed.description,
      status: parsed.status,
      priority: parsed.priority,
      dueDate: parsed.dueDate,
      assignedTo: parsed.assignedTo,
      updatedBy: userId,
    });

    if (result.status === 'task_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Task not found',
      });
    }

    if (result.status === 'assignee_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Assigned user not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Task updated successfully',
      data: result.task,
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
      message: 'Failed to update task',
      details: (error as Error).message,
    });
  }
};

export const deleteTaskHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const taskId = objectIdSchema.parse(req.params.taskId);
    const result = await deleteTask(userId, taskId, userId);

    if (result.status === 'task_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Task not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Task deleted successfully',
      data: result.task,
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
      message: 'Failed to delete task',
      details: (error as Error).message,
    });
  }
};
