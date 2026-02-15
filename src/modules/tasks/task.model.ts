import { Schema, model } from 'mongoose';
import { ITask } from './task.interface';

const taskSchema = new Schema<ITask>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: null, maxlength: 2000 },
    status: { type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo', index: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
    dueDate: { type: Date, default: null, index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false }
);

taskSchema.index({ ownerId: 1, status: 1, deletedAt: 1 });
taskSchema.index({ ownerId: 1, priority: 1, deletedAt: 1 });
taskSchema.index({ ownerId: 1, assignedTo: 1, deletedAt: 1 });

export const Task = model<ITask>('Tasks', taskSchema);
