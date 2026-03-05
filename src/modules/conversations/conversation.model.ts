import { Schema, model } from 'mongoose';
import { IConversation } from './conversation.interface';

const conversationSchema = new Schema<IConversation>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contacts', default: null, index: true },
    mailboxId: { type: Schema.Types.ObjectId, ref: 'GoogleMailbox', default: null, index: true },
    method: { type: String, enum: ['email', 'sms'], required: true, index: true },
    direction: { type: String, enum: ['incoming', 'outgoing'], required: true, index: true },
    subject: { type: String, default: null, trim: true, maxlength: 250 },
    body: { type: String, default: null, maxlength: 10000 },
    from: { type: String, default: null, trim: true, lowercase: true, maxlength: 100 },
    to: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 100 }],
      default: [],
    },
    participants: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 100 }],
      default: [],
    },
    externalMessageId: { type: String, default: null, trim: true, maxlength: 200 },
    externalThreadId: { type: String, default: null, trim: true, maxlength: 200 },
    sentAt: { type: Date, default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false }
);

conversationSchema.index({ ownerId: 1, method: 1, deletedAt: 1 });
conversationSchema.index({ ownerId: 1, contactId: 1, sentAt: -1 });
conversationSchema.index(
  { ownerId: 1, method: 1, externalMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalMessageId: { $type: 'string' },
      deletedAt: null,
    },
  }
);

export const Conversation = model<IConversation>('Conversations', conversationSchema);
