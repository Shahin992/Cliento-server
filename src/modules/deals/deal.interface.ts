import { Document, Types } from 'mongoose';

export type DealStatus = 'open' | 'won' | 'lost';

export interface IPipelineStage {
  _id: Types.ObjectId;
  name: string;
  color?: string | null;
  order: number;
  isDefault?: boolean;
}

export interface IPipeline extends Document {
  ownerId: Types.ObjectId;
  name: string;
  isDefault: boolean;
  stages: IPipelineStage[];
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId | null;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
}

export interface IDeal extends Document {
  ownerId: Types.ObjectId;
  pipelineId: Types.ObjectId;
  stageId: Types.ObjectId;
  title: string;
  amount?: number | null;
  contactId?: Types.ObjectId | null;
  expectedCloseDate?: Date | null;
  status: DealStatus;
  wonAt?: Date | null;
  lostAt?: Date | null;
  lostReason?: string | null;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId | null;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
}

export type CreatePipelineStageInput = {
  name: string;
  color?: string | null;
  order?: number;
  isDefault?: boolean;
};

export type CreatePipelineInput = {
  ownerId: string;
  name: string;
  isDefault?: boolean;
  stages: CreatePipelineStageInput[];
  createdBy: string;
  updatedBy?: string | null;
};

export type CreateDealInput = {
  ownerId: string;
  pipelineId: string;
  stageId: string;
  title: string;
  amount?: number | null;
  contactId?: string | null;
  expectedCloseDate?: Date | null;
  createdBy: string;
  updatedBy?: string | null;
};
