import { Schema, model } from 'mongoose';

export interface IPasswordResetOtp {
  user: Schema.Types.ObjectId;
  email: string;
  otpHash: string;
  expiresAt: Date;
  deleteAt: Date;
  usedAt?: Date | null;
}

const passwordResetOtpSchema = new Schema<IPasswordResetOtp>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    deleteAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

passwordResetOtpSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetOtp = model<IPasswordResetOtp>('PasswordResetOtp', passwordResetOtpSchema);
