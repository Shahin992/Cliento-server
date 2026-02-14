import { FilterQuery } from 'mongoose';
import { CreateDealInput, IDeal } from './deal.interface';
import { Contact } from '../contacts/contact.model';
import { Deal } from './deal.model';
import { Pipeline } from './pipeline.model';

const formatDealResponse = (deal: any) => {
  const dealObj = typeof deal?.toObject === 'function' ? deal.toObject() : deal;
  const owner = dealObj?.ownerId && typeof dealObj.ownerId === 'object' ? dealObj.ownerId : null;
  const pipeline = dealObj?.pipelineId && typeof dealObj.pipelineId === 'object' ? dealObj.pipelineId : null;
  const contact = dealObj?.contactId && typeof dealObj.contactId === 'object' ? dealObj.contactId : null;
  const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : [];
  const matchedStage = stages.find((stage: any) => String(stage?._id) === String(dealObj?.stageId));

  const pipelineData = pipeline
    ? {
        _id: pipeline._id,
        name: pipeline.name,
        isDefault: pipeline.isDefault,
      }
    : dealObj.pipelineId
      ? { _id: dealObj.pipelineId, name: null, isDefault: null }
      : null;

  const stageData = matchedStage
    ? {
        _id: matchedStage._id,
        name: matchedStage.name,
        color: matchedStage.color ?? null,
        order: matchedStage.order,
        isDefault: matchedStage.isDefault ?? false,
      }
    : dealObj.stageId
      ? {
          _id: dealObj.stageId,
          name: null,
          color: null,
          order: null,
          isDefault: false,
        }
      : null;

  const contactData = contact
    ? contact
    : dealObj.contactId
      ? { _id: dealObj.contactId }
      : null;

  const {
    ownerId: _ownerId,
    pipelineId: _pipelineId,
    stageId: _stageId,
    contactId: _contactId,
    ...rest
  } = dealObj;

  return {
    ...rest,
    dealOwner: owner
      ? {
          _id: owner._id,
          name: owner.fullName,
          email: owner.email,
          phone: owner.phoneNumber ?? null,
        }
      : dealObj.ownerId
        ? {
            _id: dealObj.ownerId,
            name: null,
            email: null,
            phone: null,
          }
        : null,
    pipeline: pipelineData,
    stage: stageData,
    contact: contactData,
  };
};

const validatePipelineAndStage = async (ownerId: string, pipelineId: string, stageId: string) => {
  const pipeline = await Pipeline.findOne({
    _id: pipelineId,
    ownerId,
    deletedAt: null,
  }).select('_id stages');

  if (!pipeline) {
    return { status: 'pipeline_not_found' as const, pipeline: null };
  }

  const stageExists = pipeline.stages.some((stage) => String(stage._id) === stageId);
  if (!stageExists) {
    return { status: 'invalid_stage_for_pipeline' as const, pipeline };
  }

  return { status: 'ok' as const, pipeline };
};

const validateContact = async (ownerId: string, contactId?: string | null) => {
  if (!contactId) {
    return { status: 'ok' as const };
  }

  const contact = await Contact.findOne({
    _id: contactId,
    ownerId,
    deletedAt: null,
  }).select('_id');

  if (!contact) {
    return { status: 'contact_not_found' as const };
  }

  return { status: 'ok' as const };
};

export const createDeal = async (payload: CreateDealInput) => {
  const pipelineCheck = await validatePipelineAndStage(payload.ownerId, payload.pipelineId, payload.stageId);
  if (pipelineCheck.status !== 'ok') {
    return { status: pipelineCheck.status };
  }

  const contactCheck = await validateContact(payload.ownerId, payload.contactId);
  if (contactCheck.status !== 'ok') {
    return { status: contactCheck.status };
  }

  const deal = await Deal.create({
    ownerId: payload.ownerId,
    pipelineId: payload.pipelineId,
    stageId: payload.stageId,
    title: payload.title.trim(),
    amount: payload.amount ?? null,
    contactId: payload.contactId ?? null,
    expectedCloseDate: payload.expectedCloseDate ?? null,
    status: 'open',
    createdBy: payload.createdBy,
    updatedBy: payload.updatedBy ?? payload.createdBy,
  });

  return { status: 'ok' as const, deal };
};

export const getDealDetails = async (ownerId: string, dealId: string) => {
  const deal = await Deal.findOne({
    _id: dealId,
    ownerId,
    deletedAt: null,
  })
    .populate({ path: 'ownerId', select: '_id fullName email phoneNumber' })
    .populate({ path: 'pipelineId', select: '_id name isDefault stages' })
    .populate({ path: 'contactId', select: '_id firstName lastName emails phones companyName' });

  if (!deal) {
    return { status: 'deal_not_found' as const };
  }

  return { status: 'ok' as const, deal: formatDealResponse(deal) };
};

type ListDealsQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: 'open' | 'won' | 'lost';
  pipelineId?: string;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const createRegex = (value: string) => new RegExp(escapeRegExp(value.trim()), 'i');

export const listDeals = async (ownerId: string, query: ListDealsQuery) => {
  const conditions: FilterQuery<IDeal>[] = [{ ownerId, deletedAt: null }];

  if (query.status) {
    conditions.push({ status: query.status });
  }

  if (query.pipelineId) {
    conditions.push({ pipelineId: query.pipelineId });
  }

  if (query.search) {
    const regex = createRegex(query.search);
    conditions.push({
      $or: [
        { title: regex },
      ],
    });
  }

  const filter = conditions.length === 1 ? conditions[0] : { $and: conditions };
  const skip = (query.page - 1) * query.limit;

  const [deals, total] = await Promise.all([
    Deal.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate({ path: 'ownerId', select: '_id fullName email phoneNumber' })
      .populate({ path: 'pipelineId', select: '_id name stages' })
      .populate({ path: 'contactId', select: '_id firstName lastName companyName' }),
    Deal.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / query.limit);
  const dealsWithStageName = deals.map((deal) => formatDealResponse(deal));

  return {
    deals: dealsWithStageName,
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

type UpdateDealInput = {
  ownerId: string;
  dealId: string;
  pipelineId?: string;
  stageId?: string;
  title?: string;
  amount?: number | null;
  contactId?: string | null;
  expectedCloseDate?: Date | null;
  updatedBy: string;
};

export const updateDeal = async (payload: UpdateDealInput) => {
  const deal = await Deal.findOne({
    _id: payload.dealId,
    ownerId: payload.ownerId,
    deletedAt: null,
  });

  if (!deal) {
    return { status: 'deal_not_found' as const };
  }

  const nextPipelineId = payload.pipelineId ?? String(deal.pipelineId);
  const nextStageId = payload.stageId ?? String(deal.stageId);
  const pipelineCheck = await validatePipelineAndStage(payload.ownerId, nextPipelineId, nextStageId);
  if (pipelineCheck.status !== 'ok') {
    return { status: pipelineCheck.status };
  }

  const contactCheck = await validateContact(payload.ownerId, payload.contactId);
  if (contactCheck.status !== 'ok') {
    return { status: contactCheck.status };
  }

  if (payload.pipelineId !== undefined) {
    deal.pipelineId = payload.pipelineId as any;
  }
  if (payload.stageId !== undefined) {
    deal.stageId = payload.stageId as any;
  }
  if (payload.title !== undefined) {
    deal.title = payload.title.trim();
  }
  if (payload.amount !== undefined) {
    deal.amount = payload.amount;
  }
  if (payload.contactId !== undefined) {
    deal.contactId = payload.contactId as any;
  }
  if (payload.expectedCloseDate !== undefined) {
    deal.expectedCloseDate = payload.expectedCloseDate;
  }

  deal.updatedBy = payload.updatedBy as any;
  await deal.save();

  return { status: 'ok' as const, deal };
};

export const deleteDeal = async (ownerId: string, dealId: string, deletedBy: string) => {
  const deal = await Deal.findOneAndUpdate(
    { _id: dealId, ownerId, deletedAt: null },
    {
      deletedAt: new Date(),
      deletedBy,
      updatedBy: deletedBy,
    },
    { new: true }
  );

  if (!deal) {
    return { status: 'deal_not_found' as const };
  }

  return { status: 'ok' as const, deal };
};

export const markDealWon = async (ownerId: string, dealId: string, updatedBy: string) => {
  const deal = await Deal.findOneAndUpdate(
    { _id: dealId, ownerId, deletedAt: null },
    {
      status: 'won',
      wonAt: new Date(),
      lostAt: null,
      lostReason: null,
      updatedBy,
    },
    { new: true }
  );

  if (!deal) {
    return { status: 'deal_not_found' as const };
  }

  return { status: 'ok' as const, deal };
};

export const markDealLost = async (
  ownerId: string,
  dealId: string,
  updatedBy: string,
  lostReason?: string | null
) => {
  const deal = await Deal.findOneAndUpdate(
    { _id: dealId, ownerId, deletedAt: null },
    {
      status: 'lost',
      lostAt: new Date(),
      wonAt: null,
      lostReason: lostReason ?? null,
      updatedBy,
    },
    { new: true }
  );

  if (!deal) {
    return { status: 'deal_not_found' as const };
  }

  return { status: 'ok' as const, deal };
};
