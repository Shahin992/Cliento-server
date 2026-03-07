import { Schema, model } from 'mongoose';
import { IContactList } from './smartList.interface';

const LENGTH = {
  name: 80,
  description: 300,
  contactsMax: 5000,
} as const;

const contactListSchema = new Schema<IContactList>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: LENGTH.name },
  description: { type: String, default: null, trim: true, maxlength: LENGTH.description },
  contactIds: {
    type: [{ type: Schema.Types.ObjectId, ref: 'Contacts' }],
    default: [],
    validate: {
      validator: (arr: unknown[]) => Array.isArray(arr) && arr.length <= LENGTH.contactsMax,
      message: `Smart list cannot exceed ${LENGTH.contactsMax} contacts`,
    },
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, versionKey: false });

contactListSchema.index({ ownerId: 1, name: 1 }, { unique: true });
contactListSchema.index({ ownerId: 1, deletedAt: 1, createdAt: -1 });

export const ContactList = model<IContactList>('SmartContactList', contactListSchema);
