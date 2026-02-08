import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from './user.interface';



const userSchema = new Schema<IUser>({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'SUPER_ADMIN', 'USER'], default: 'ADMIN' },
  isParentUser: { type: Boolean, default: true },
  profilePhoto: { type: String, default: null },
  phoneNumber: { type: String, default: null },
  location: { type: String, default: null },
  timeZone: { type: String, default: null },
  signature: { type: String, default: null },
  accessExpiresAt: { type: Date, default: null },
  planType: { type: String, enum: ['trial', 'paid'], default: 'trial' }
}, { timestamps: true, versionKey: false });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = model<IUser>('User', userSchema);
