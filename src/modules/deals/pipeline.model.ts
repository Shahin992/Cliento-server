import { Schema, model } from 'mongoose';
import { IPipeline } from './deal.interface';

const stageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    color: { type: String, default: null, maxlength: 20 },
    order: { type: Number, required: true, min: 0 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, versionKey: false }
);

const pipelineSchema = new Schema<IPipeline>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    isDefault: { type: Boolean, default: false, index: true },
    stages: {
      type: [stageSchema],
      validate: {
        validator: (arr: unknown[]) => Array.isArray(arr) && arr.length > 0,
        message: 'At least one stage is required',
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false }
);

pipelineSchema.index({ ownerId: 1, name: 1 }, { unique: true });
pipelineSchema.index({ ownerId: 1, deletedAt: 1 });

export const Pipeline = model<IPipeline>('Pipelines', pipelineSchema);
