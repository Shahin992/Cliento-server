import { CreatePipelineInput, CreatePipelineStageInput } from './deal.interface';
import { Pipeline } from './pipeline.model';

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

  return { status: 'ok' as const, pipeline };
};

type DeletePipelineInput = {
  ownerId: string;
  pipelineId: string;
  deletedBy: string;
};

export const deletePipeline = async (payload: DeletePipelineInput) => {
  const pipeline = await Pipeline.findOneAndUpdate(
    { _id: payload.pipelineId, ownerId: payload.ownerId, deletedAt: null },
    {
      deletedAt: new Date(),
      deletedBy: payload.deletedBy,
      updatedBy: payload.deletedBy,
      isDefault: false,
    },
    { new: true }
  );

  if (!pipeline) {
    return { status: 'pipeline_not_found' as const };
  }

  return { status: 'ok' as const, pipeline };
};

export const listPipelines = async (ownerId: string) => {
  const pipelines = await Pipeline.find({ ownerId, deletedAt: null })
    .select('_id name')
    .sort({ createdAt: -1 });

  return pipelines;
};

export const getPipelineStages = async (ownerId: string, pipelineId: string) => {
  const pipeline = await Pipeline.findOne({ _id: pipelineId, ownerId, deletedAt: null })
    .select('_id name stages');

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
