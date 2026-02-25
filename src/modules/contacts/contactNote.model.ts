import { Schema, model } from 'mongoose';
import { IContactNote } from './contactNote.interface';

const LENGTH = {
  noteBody: 5000,
} as const;

const contactNoteSchema = new Schema<IContactNote>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  contactId: { type: Schema.Types.ObjectId, ref: 'Contacts', required: true, index: true },
  body: { type: String, required: true, trim: true, maxlength: LENGTH.noteBody },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, versionKey: false });

contactNoteSchema.index({ ownerId: 1, contactId: 1, createdAt: -1 });
contactNoteSchema.index({ ownerId: 1, contactId: 1, deletedAt: 1, createdAt: -1 });

export const ContactNote = model<IContactNote>('ContactNote', contactNoteSchema);
