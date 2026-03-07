import { Schema, model } from 'mongoose';
import { ITag } from './tags.interface';

const LENGTH = {
  name: 40,
  description: 300,
} as const;

const tagSchema = new Schema<ITag>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: LENGTH.name },
  color: { type: String, default: null, trim: true, maxlength: 20 },
  description: { type: String, default: null, trim: true, maxlength: LENGTH.description },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, versionKey: false });

tagSchema.index({ ownerId: 1, name: 1 }, { unique: true });
tagSchema.index({ ownerId: 1, deletedAt: 1, createdAt: -1 });

export const Tag = model<ITag>('Tag', tagSchema);
