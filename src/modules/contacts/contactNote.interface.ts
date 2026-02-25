import { Document, Types } from 'mongoose';

export interface IContactNote extends Document {
  ownerId: Types.ObjectId;
  contactId: Types.ObjectId;
  body: string;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId | null;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
}

export type CreateContactNoteInput = {
  ownerId: string;
  contactId: string;
  body: string;
  createdBy: string;
  updatedBy?: string | null;
};

export type UpdateContactNoteInput = {
  body?: string;
  updatedBy: string;
};

export type ListContactNotesQuery = {
  contactId: string;
  page: number;
  limit: number;
};
