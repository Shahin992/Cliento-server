import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from './user.model';
import { RegisterUserInput } from './user.interface';
import { PasswordResetOtp } from './passwordResetOtp.model';

type SigninInput = {
  email: string;
  password: string;
};

export const registerUser = async (payload: RegisterUserInput) => {
  const user = new User(payload);
  await user.save();
  return user;
};

export const loginUser = async (payload: SigninInput) => {
  const user = await User.findOne({ email: payload.email });
  if (!user) {
    return { status: 'not_found' as const };
  }
  if (!(await user.comparePassword(payload.password))) {
    return { status: 'invalid_password' as const };
  }

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_TOKEN_SECRET || 'this_is_cliento_crm_token_secret',
    { expiresIn: '1h' }
  );
  return { status: 'ok' as const, user, token };
};

export const createPasswordResetOtp = async (email: string) => {
  const user = await User.findOne({ email });
  if (!user) return null;

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const deleteAt = new Date(Date.now() + 10 * 60 * 1000);

  await PasswordResetOtp.deleteMany({ email, usedAt: null });
  await PasswordResetOtp.create({
    user: user._id,
    email,
    otpHash,
    expiresAt,
    deleteAt,
  });

  return { user, otp };
};

export const verifyPasswordResetOtp = async (email: string, otp: string) => {
  const record = await PasswordResetOtp.findOne({
    email,
    usedAt: null,
  }).sort({ createdAt: -1 });

  if (!record) return { status: 'invalid' as const };

  if (record.expiresAt <= new Date()) {
    return { status: 'expired' as const };
  }

  const ok = await bcrypt.compare(otp, record.otpHash);
  if (!ok) return { status: 'invalid' as const };

  record.usedAt = new Date();
  await record.save();
  return { status: 'ok' as const };
};

export const resetPasswordWithOtp = async (email: string, otp: string, newPassword: string) => {
  const record = await PasswordResetOtp.findOne({
    email,
    usedAt: { $ne: null },
  }).sort({ createdAt: -1 });

  if (!record) return { status: 'invalid' as const };

  if (record.expiresAt <= new Date()) {
    return { status: 'expired' as const };
  }

  const ok = await bcrypt.compare(otp, record.otpHash);
  if (!ok) return { status: 'invalid' as const };

  const user = await User.findOne({ email });
  if (!user) return { status: 'invalid' as const };

  user.password = newPassword;
  await user.save();

  await PasswordResetOtp.deleteOne({ _id: record._id });
  return { status: 'ok' as const, user };
};

export const updateProfilePhoto = async (userId: string, profilePhoto: string | null) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { profilePhoto },
    { new: true }
  );
  return user;
};

export const updateProfile = async (
  userId: string,
  updates: {
    fullName?: string;
    companyName?: string;
    phoneNumber?: string;
    location?: string | null;
    timeZone?: string | null;
  }
) => {
  const user = await User.findByIdAndUpdate(
    userId,
    updates,
    { new: true }
  );
  return user;
};
