import { CreateDealInput } from './deal.interface';
import { Contact } from '../contacts/contact.model';
import { Deal } from './deal.model';
import { Pipeline } from './pipeline.model';

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
    .populate({ path: 'pipelineId', select: '_id name isDefault stages' })
    .populate({ path: 'contactId', select: '_id firstName lastName emails phones companyName' });

  if (!deal) {
    return { status: 'deal_not_found' as const };
  }

  return { status: 'ok' as const, deal };
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
