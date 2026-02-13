import { Schema, model } from 'mongoose';
import { IDeal } from './deal.interface';

const dealSchema = new Schema<IDeal>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pipelineId: { type: Schema.Types.ObjectId, ref: 'Pipelines', required: true, index: true },
    stageId: { type: Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    amount: { type: Number, default: null, min: 0 },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contacts', default: null, index: true },
    expectedCloseDate: { type: Date, default: null },
    status: { type: String, enum: ['open', 'won', 'lost'], default: 'open', index: true },
    wonAt: { type: Date, default: null },
    lostAt: { type: Date, default: null },
    lostReason: { type: String, default: null, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false }
);

dealSchema.index({ ownerId: 1, pipelineId: 1, stageId: 1 });
dealSchema.index({ ownerId: 1, status: 1, deletedAt: 1 });

export const Deal = model<IDeal>('Deals', dealSchema);
