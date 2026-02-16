import { CreatePipelineInput, CreatePipelineStageInput } from './deal.interface';
import { Deal } from './deal.model';
import { Pipeline } from './pipeline.model';
import { Types } from 'mongoose';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildResolvedStages = (stages: CreatePipelineStageInput[]) => {
  const usedOrders = new Set<number>();
  const resolved = stages.map((stage) => {
    if (stage.order !== undefined) {
      usedOrders.add(stage.order);
    }
    return {
      name: stage.name.trim(),
      color: stage.color ?? null,
      order: stage.order,
      isDefault: stage.isDefault ?? false,
    };
  });

  let nextOrder = 0;
  for (const stage of resolved) {
    if (stage.order !== undefined) continue;

    while (usedOrders.has(nextOrder)) {
      nextOrder += 1;
    }
    stage.order = nextOrder;
    usedOrders.add(nextOrder);
    nextOrder += 1;
  }

  return resolved.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
};

export const createPipeline = async (payload: CreatePipelineInput) => {
  const normalizedName = payload.name.trim();
  const existingPipeline = await Pipeline.findOne({
    ownerId: payload.ownerId,
    deletedAt: null,
    name: new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i'),
  }).select('_id');

  if (existingPipeline) {
    return { status: 'duplicate_pipeline_name' as const };
  }

  const resolvedStages = buildResolvedStages(payload.stages);

  const pipeline = await Pipeline.create({
    ownerId: payload.ownerId,
    name: normalizedName,
    isDefault: payload.isDefault ?? false,
    stages: resolvedStages,
    createdBy: payload.createdBy,
    updatedBy: payload.updatedBy ?? payload.createdBy,
  });

  if (pipeline.isDefault) {
    await Pipeline.updateMany(
      { ownerId: payload.ownerId, _id: { $ne: pipeline._id }, deletedAt: null, isDefault: true },
      { $set: { isDefault: false, updatedBy: payload.updatedBy ?? payload.createdBy } }
    );
  }

  return { status: 'ok' as const, pipeline };
};

type AddStageInput = {
  ownerId: string;
  pipelineId: string;
  name: string;
  color?: string | null;
  order?: number;
  isDefault?: boolean;
  updatedBy: string;
};

export const addPipelineStage = async (payload: AddStageInput) => {
  const pipeline = await Pipeline.findOne({
    _id: payload.pipelineId,
    ownerId: payload.ownerId,
    deletedAt: null,
  });

  if (!pipeline) {
    return { status: 'pipeline_not_found' as const };
  }

  const stageName = payload.name.trim();
  const stageNameExists = pipeline.stages.some(
    (stage) => stage.name.trim().toLowerCase() === stageName.toLowerCase()
  );
  if (stageNameExists) {
    return { status: 'duplicate_stage_name' as const };
  }

  if (payload.order !== undefined) {
    const orderExists = pipeline.stages.some((stage) => stage.order === payload.order);
    if (orderExists) {
      return { status: 'duplicate_stage_order' as const };
    }
  }

  const maxOrder = pipeline.stages.reduce((max, stage) => Math.max(max, stage.order), -1);
  const stageOrder = payload.order ?? maxOrder + 1;
  const shouldBeDefault = payload.isDefault ?? false;

  if (shouldBeDefault) {
    pipeline.stages = pipeline.stages.map((stage) => ({ ...stage, isDefault: false })) as any;
  }

  pipeline.stages.push({
    name: stageName,
    color: payload.color ?? null,
    order: stageOrder,
    isDefault: shouldBeDefault,
  } as any);

  pipeline.updatedBy = payload.updatedBy as any;
  await pipeline.save();

  return { status: 'ok' as const, pipeline };
};

type UpdatePipelineInput = {
  ownerId: string;
  pipelineId: string;
  name?: string;
  isDefault?: boolean;
  stages?: Array<{
    _id?: string;
    name: string;
    color?: string | null;
    order?: number;
    isDefault?: boolean;
  }>;
  updatedBy: string;
};

export const updatePipeline = async (payload: UpdatePipelineInput) => {
  const pipeline = await Pipeline.findOne({
    _id: payload.pipelineId,
    ownerId: payload.ownerId,
    deletedAt: null,
  });

  if (!pipeline) {
    return { status: 'pipeline_not_found' as const };
  }

  if (payload.name !== undefined) {
    const normalizedName = payload.name.trim();
    const existingPipeline = await Pipeline.findOne({
      ownerId: payload.ownerId,
      deletedAt: null,
      _id: { $ne: payload.pipelineId },
      name: new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i'),
    }).select('_id');

    if (existingPipeline) {
      return { status: 'duplicate_pipeline_name' as const };
    }

    pipeline.name = normalizedName;
  }

  if (payload.isDefault !== undefined) {
    pipeline.isDefault = payload.isDefault;
  }

  let movedDealsCount = 0;
  if (payload.stages !== undefined) {
    const existingStageMap = new Map(pipeline.stages.map((stage) => [String(stage._id), stage]));

    for (const stage of payload.stages) {
      if (stage._id && !existingStageMap.has(stage._id)) {
        return { status: 'invalid_stage_id' as const };
      }
    }

    const nextStages = payload.stages.map((stage, index) => ({
      _id: stage._id ? new Types.ObjectId(stage._id) : new Types.ObjectId(),
      name: stage.name.trim(),
      color: stage.color ?? null,
      order: stage.order ?? index,
      isDefault: stage.isDefault ?? false,
    }));

    const orderSet = new Set<number>();
    for (const stage of nextStages) {
      if (orderSet.has(stage.order)) {
        return { status: 'duplicate_stage_order' as const };
      }
      orderSet.add(stage.order);
    }

    const nextStageIds = new Set(nextStages.map((stage) => String(stage._id)));
    const removedStageIds = pipeline.stages
      .map((stage) => String(stage._id))
      .filter((stageId) => !nextStageIds.has(stageId));

    const sortedStages = [...nextStages].sort((a, b) => a.order - b.order);
    const fallbackStage = sortedStages.find((stage) => stage.isDefault) ?? sortedStages[0];

    if (!fallbackStage) {
      return { status: 'invalid_stages' as const };
    }

    if (removedStageIds.length > 0) {
      const moveDealsResult = await Deal.updateMany(
        {
          ownerId: payload.ownerId,
          pipelineId: payload.pipelineId,
          stageId: { $in: removedStageIds.map((id) => new Types.ObjectId(id)) },
          deletedAt: null,
        },
        {
          $set: {
            stageId: fallbackStage._id,
            updatedBy: payload.updatedBy,
          },
        }
      );
      movedDealsCount = moveDealsResult.modifiedCount ?? 0;
    }

    pipeline.stages = sortedStages as any;
  }

  pipeline.updatedBy = payload.updatedBy as any;
  await pipeline.save();

  if (pipeline.isDefault) {
    await Pipeline.updateMany(
      {
        ownerId: payload.ownerId,
        _id: { $ne: pipeline._id },
        deletedAt: null,
        isDefault: true,
      },
      { $set: { isDefault: false, updatedBy: payload.updatedBy } }
    );
  }

  return { status: 'ok' as const, pipeline, movedDealsCount };
};

type DeletePipelineInput = {
  ownerId: string;
  pipelineId: string;
  deletedBy: string;
  dealAction: 'move' | 'delete';
  targetPipelineId?: string;
};

export const deletePipeline = async (payload: DeletePipelineInput) => {
  const pipeline = await Pipeline.findOne({
    _id: payload.pipelineId,
    ownerId: payload.ownerId,
    deletedAt: null,
  });

  if (!pipeline) {
    return { status: 'pipeline_not_found' as const };
  }

  const now = new Date();
  let dealsAffected = 0;

  if (payload.dealAction === 'move') {
    if (!payload.targetPipelineId || payload.targetPipelineId === payload.pipelineId) {
      return { status: 'invalid_target_pipeline' as const };
    }

    const targetPipeline = await Pipeline.findOne({
      _id: payload.targetPipelineId,
      ownerId: payload.ownerId,
      deletedAt: null,
    }).select('_id stages');

    if (!targetPipeline) {
      return { status: 'target_pipeline_not_found' as const };
    }

    const sortedStages = [...targetPipeline.stages].sort((a, b) => a.order - b.order);
    const targetStage = sortedStages.find((stage) => stage.isDefault) ?? sortedStages[0];
    if (!targetStage) {
      return { status: 'target_pipeline_has_no_stages' as const };
    }

    const moveResult = await Deal.updateMany(
      { ownerId: payload.ownerId, pipelineId: payload.pipelineId, deletedAt: null },
      {
        $set: {
          pipelineId: payload.targetPipelineId,
          stageId: targetStage._id,
          updatedBy: payload.deletedBy,
        },
      }
    );
    dealsAffected = moveResult.modifiedCount ?? 0;
  } else {
    const deleteDealsResult = await Deal.updateMany(
      { ownerId: payload.ownerId, pipelineId: payload.pipelineId, deletedAt: null },
      {
        $set: {
          deletedAt: now,
          deletedBy: payload.deletedBy,
          updatedBy: payload.deletedBy,
        },
      }
    );
    dealsAffected = deleteDealsResult.modifiedCount ?? 0;
  }

  pipeline.deletedAt = now;
  pipeline.deletedBy = payload.deletedBy as any;
  pipeline.updatedBy = payload.deletedBy as any;
  pipeline.isDefault = false;
  await pipeline.save();

  return {
    status: 'ok' as const,
    pipeline,
    dealsAffected,
    dealAction: payload.dealAction,
    targetPipelineId: payload.targetPipelineId ?? null,
  };
};

type ListPipelinesQuery = {
  page: number;
  limit: number;
  search?: string;
};

export const listPipelines = async (ownerId: string, query: ListPipelinesQuery) => {
  const baseFilter: Record<string, unknown> = { ownerId, deletedAt: null };
  if (query.search) {
    baseFilter.name = new RegExp(escapeRegExp(query.search.trim()), 'i');
  }

  const skip = (query.page - 1) * query.limit;

  const [pipelines, total] = await Promise.all([
    Pipeline.find(baseFilter)
      .select('_id name isDefault createdAt updatedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit),
    Pipeline.countDocuments(baseFilter),
  ]);

  const totalPages = Math.ceil(total / query.limit);

  return {
    pipelines,
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

export const listPipelinesWithStages = async (ownerId: string, query: ListPipelinesQuery) => {
  const baseFilter: Record<string, unknown> = { ownerId, deletedAt: null };
  if (query.search) {
    baseFilter.name = new RegExp(escapeRegExp(query.search.trim()), 'i');
  }

  const skip = (query.page - 1) * query.limit;

  const [pipelines, total] = await Promise.all([
    Pipeline.find(baseFilter)
      .select('_id name isDefault stages createdAt updatedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit),
    Pipeline.countDocuments(baseFilter),
  ]);

  const pipelinesWithSortedStages = pipelines.map((pipeline) => {
    const stages = [...pipeline.stages].sort((a, b) => a.order - b.order);
    return {
      _id: pipeline._id,
      name: pipeline.name,
      isDefault: pipeline.isDefault,
      createdAt: (pipeline as any).createdAt,
      updatedAt: (pipeline as any).updatedAt,
      stages,
    };
  });

  const totalPages = Math.ceil(total / query.limit);

  return {
    pipelines: pipelinesWithSortedStages,
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

export const getPipelineStages = async (ownerId: string, pipelineId: string) => {
  const pipeline = await Pipeline.findOne({ _id: pipelineId, ownerId, deletedAt: null })
    .select('_id name isDefault stages createdAt updatedAt');

  if (!pipeline) {
    return { status: 'pipeline_not_found' as const };
  }

  const sortedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);

  return {
    status: 'ok' as const,
    pipeline: {
      _id: pipeline._id,
      name: pipeline.name,
      isDefault: pipeline.isDefault,
      createdAt: (pipeline as any).createdAt,
      updatedAt: (pipeline as any).updatedAt,
      stages: sortedStages,
    },
  };
};

export const getPipelineById = async (ownerId: string, pipelineId: string) => {
  const pipeline = await Pipeline.findOne({ _id: pipelineId, ownerId, deletedAt: null })
    .select('_id name isDefault stages createdAt updatedAt');

  if (!pipeline) {
    return { status: 'pipeline_not_found' as const };
  }

  const sortedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);

  return {
    status: 'ok' as const,
    pipeline: {
      _id: pipeline._id,
      name: pipeline.name,
      isDefault: pipeline.isDefault,
      createdAt: (pipeline as any).createdAt,
      updatedAt: (pipeline as any).updatedAt,
      stages: sortedStages,
    },
  };
};
