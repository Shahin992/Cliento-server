import { FilterQuery } from 'mongoose';
import { User } from '../users/user.model';
import { CreateTaskInput, ITask, ListTasksQuery, UpdateTaskInput } from './task.interface';
import { Task } from './task.model';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const createRegex = (value: string) => new RegExp(escapeRegExp(value.trim()), 'i');

const formatTaskResponse = (task: any) => {
  const taskObj = typeof task?.toObject === 'function' ? task.toObject() : task;
  const owner = taskObj?.ownerId && typeof taskObj.ownerId === 'object' ? taskObj.ownerId : null;
  const assignee = taskObj?.assignedTo && typeof taskObj.assignedTo === 'object' ? taskObj.assignedTo : null;

  const {
    ownerId: _ownerId,
    assignedTo: _assignedTo,
    ...rest
  } = taskObj;

  return {
    ...rest,
    owner: owner
      ? {
          _id: owner._id,
          name: owner.fullName,
          email: owner.email,
        }
      : taskObj.ownerId
        ? { _id: taskObj.ownerId, name: null, email: null }
        : null,
    assignedTo: assignee
      ? {
          _id: assignee._id,
          name: assignee.fullName,
          email: assignee.email,
          role: assignee.role,
        }
      : taskObj.assignedTo
        ? { _id: taskObj.assignedTo, name: null, email: null, role: null }
        : null,
  };
};

const validateAssignee = async (assigneeId?: string | null) => {
  if (!assigneeId) {
    return { status: 'ok' as const };
  }

  const assignee = await User.findById(assigneeId).select('_id');
  if (!assignee) {
    return { status: 'assignee_not_found' as const };
  }

  return { status: 'ok' as const };
};

export const createTask = async (payload: CreateTaskInput) => {
  const assigneeCheck = await validateAssignee(payload.assignedTo);
  if (assigneeCheck.status !== 'ok') {
    return assigneeCheck;
  }

  const task = await Task.create({
    ownerId: payload.ownerId,
    title: payload.title.trim(),
    description: payload.description ?? null,
    status: payload.status ?? 'todo',
    priority: payload.priority ?? 'medium',
    dueDate: payload.dueDate ?? null,
    assignedTo: payload.assignedTo ?? null,
    createdBy: payload.createdBy,
    updatedBy: payload.updatedBy ?? payload.createdBy,
  });

  return { status: 'ok' as const, task };
};

export const getTaskDetails = async (ownerId: string, taskId: string) => {
  const task = await Task.findOne({
    _id: taskId,
    ownerId,
    deletedAt: null,
  })
    .populate({ path: 'ownerId', select: '_id fullName email' })
    .populate({ path: 'assignedTo', select: '_id fullName email role' });

  if (!task) {
    return { status: 'task_not_found' as const };
  }

  return { status: 'ok' as const, task: formatTaskResponse(task) };
};

export const listTasks = async (ownerId: string, query: ListTasksQuery) => {
  const conditions: FilterQuery<ITask>[] = [{ ownerId, deletedAt: null }];

  if (query.search) {
    const regex = createRegex(query.search);
    conditions.push({
      $or: [{ title: regex }, { description: regex }],
    });
  }

  if (query.status) {
    conditions.push({ status: query.status });
  }

  if (query.priority) {
    conditions.push({ priority: query.priority });
  }

  if (query.assignedTo) {
    conditions.push({ assignedTo: query.assignedTo });
  }

  const filter = conditions.length === 1 ? conditions[0] : { $and: conditions };
  const skip = (query.page - 1) * query.limit;

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate({ path: 'ownerId', select: '_id fullName email' })
      .populate({ path: 'assignedTo', select: '_id fullName email role' }),
    Task.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / query.limit);

  return {
    tasks: tasks.map((task) => formatTaskResponse(task)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPrevPage: query.page > 1,
    },
  };
};

export const updateTask = async (payload: UpdateTaskInput) => {
  const task = await Task.findOne({
    _id: payload.taskId,
    ownerId: payload.ownerId,
    deletedAt: null,
  });

  if (!task) {
    return { status: 'task_not_found' as const };
  }

  const assigneeCheck = await validateAssignee(payload.assignedTo);
  if (assigneeCheck.status !== 'ok') {
    return assigneeCheck;
  }

  if (payload.title !== undefined) task.title = payload.title.trim();
  if (payload.description !== undefined) task.description = payload.description;
  if (payload.status !== undefined) task.status = payload.status;
  if (payload.priority !== undefined) task.priority = payload.priority;
  if (payload.dueDate !== undefined) task.dueDate = payload.dueDate;
  if (payload.assignedTo !== undefined) task.assignedTo = payload.assignedTo as any;

  task.updatedBy = payload.updatedBy as any;
  await task.save();

  return { status: 'ok' as const, task };
};

export const deleteTask = async (ownerId: string, taskId: string, deletedBy: string) => {
  const task = await Task.findOneAndUpdate(
    { _id: taskId, ownerId, deletedAt: null },
    {
      deletedAt: new Date(),
      deletedBy,
      updatedBy: deletedBy,
    },
    { new: true }
  );

  if (!task) {
    return { status: 'task_not_found' as const };
  }

  return { status: 'ok' as const, task };
};
