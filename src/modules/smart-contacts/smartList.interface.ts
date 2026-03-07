import { Document, Types } from 'mongoose';

export interface IContactList extends Document {
  ownerId: Types.ObjectId;
  name: string;
  description?: string | null;
  contactIds: Types.ObjectId[];
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId | null;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
}

export type CreateContactListInput = {
  ownerId: string;
  name: string;
  description?: string | null;
  contactIds: string[];
  createdBy: string;
  updatedBy?: string | null;
};

export type UpdateContactListInput = Partial<Omit<CreateContactListInput, 'ownerId' | 'createdBy'>>;

export type ListContactListsQuery = {
  page: number;
  limit: number;
  search?: string;
};
