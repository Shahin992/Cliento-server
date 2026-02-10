import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from './user.interface';



const userSchema = new Schema<IUser>({
  fullName: { type: String, required: true },
  companyName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MEMBER'], default: 'OWNER' },
  teamId: { type: Number, default: null },
  ownerInfo: {
    type: {
      ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    default: null,
  },
  profilePhoto: { type: String, default: null },
  phoneNumber: { type: String, default: null },
  location: { type: String, default: null },
  timeZone: { type: String, default: null },
  accessExpiresAt: { type: Date, default: null },
  planType: { type: String, enum: ['trial', 'paid'], default: 'trial' }
}, { timestamps: true, versionKey: false });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.pre('save', async function(next) {
  if (!this.isNew) return next();
  if (this.role !== 'OWNER') return next();
  if (this.teamId !== null && this.teamId !== undefined) return next();

  const lastOwnerWithTeam = await User.findOne({ role: 'OWNER', teamId: { $ne: null } })
    .sort({ teamId: -1 })
    .select({ teamId: 1 });

  const lastTeamId = lastOwnerWithTeam?.teamId ?? 0;
  this.teamId = lastTeamId + 1;
  next();
});

userSchema.methods.comparePassword = function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = model<IUser>('User', userSchema);
