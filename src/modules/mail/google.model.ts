import { Schema, model, Types } from 'mongoose';

export interface IGoogleMailbox {
  userId: Types.ObjectId;
  googleEmail: string;
  accessToken: string;
  refreshToken: string;
  tokenType?: string | null;
  scope?: string[];
  expiryDate?: Date | null;
  historyId?: string | null;
  isDefault: boolean;
  isDisconnected: boolean;
  isDeleted: boolean;
  disconnectedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const googleMailboxSchema = new Schema<IGoogleMailbox>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    googleEmail: { type: String, required: true, trim: true, lowercase: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    tokenType: { type: String, default: null },
    scope: { type: [String], default: [] },
    expiryDate: { type: Date, default: null },
    historyId: { type: String, default: null },
    isDefault: { type: Boolean, default: true },
    isDisconnected: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    disconnectedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

googleMailboxSchema.index({ userId: 1, googleEmail: 1 }, { unique: true });
googleMailboxSchema.index({ userId: 1, isDefault: 1, isDeleted: 1 });

export const GoogleMailbox = model<IGoogleMailbox>('GoogleMailbox', googleMailboxSchema);
