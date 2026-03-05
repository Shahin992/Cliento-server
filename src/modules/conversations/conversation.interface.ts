import { Document, Types } from 'mongoose';

export type ConversationMethod = 'email' | 'sms';
export type ConversationDirection = 'incoming' | 'outgoing';

export interface IConversation extends Document {
  ownerId: Types.ObjectId;
  contactId?: Types.ObjectId | null;
  mailboxId?: Types.ObjectId | null;
  method: ConversationMethod;
  direction: ConversationDirection;
  subject?: string | null;
  body?: string | null;
  from?: string | null;
  to: string[];
  participants: string[];
  externalMessageId?: string | null;
  externalThreadId?: string | null;
  sentAt?: Date | null;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId | null;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
}

export type CreateConversationInput = {
  ownerId: string;
  contactId?: string | null;
  mailboxId?: string | null;
  method: ConversationMethod;
  direction: ConversationDirection;
  subject?: string | null;
  body?: string | null;
  from?: string | null;
  to?: string[];
  participants?: string[];
  externalMessageId?: string | null;
  externalThreadId?: string | null;
  sentAt?: Date | null;
  createdBy: string;
  updatedBy?: string | null;
};

export type UpdateConversationInput = Partial<Omit<CreateConversationInput, 'ownerId' | 'createdBy' | 'method'>> & {
  ownerId: string;
  conversationId: string;
  updatedBy: string;
};

export type ListConversationsQuery = {
  page: number;
  limit: number;
  contactId: string;
};
