import { Document, Types } from 'mongoose';

export interface ITag extends Document {
  ownerId: Types.ObjectId;
  name: string;
  color?: string | null;
  description?: string | null;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId | null;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
}

export type CreateTagInput = {
  ownerId: string;
  name: string;
  color?: string | null;
  description?: string | null;
  createdBy: string;
  updatedBy?: string | null;
};

export type UpdateTagInput = Partial<Omit<CreateTagInput, 'ownerId' | 'createdBy'>>;

export type ListTagsQuery = {
  page: number;
  limit: number;
  search?: string;
};
