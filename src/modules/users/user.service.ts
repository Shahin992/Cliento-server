import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from './user.model';
import { RegisterUserInput } from './user.interface';
import { PasswordResetOtp } from './passwordResetOtp.model';
import { BillingSubscription } from '../subscription/subscription.model';

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
    { expiresIn: '7d' }
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

export const changePassword = async (userId: string, currentPassword: string, newPassword: string) => {
  const user = await User.findById(userId);
  if (!user) return { status: 'not_found' as const };

  const ok = await user.comparePassword(currentPassword);
  if (!ok) return { status: 'invalid_password' as const };

  user.password = newPassword;
  await user.save();
  return { status: 'ok' as const };
};

export const getMyProfile = async (userId: string) => {
  const user = await User.findById(userId);
  return user;
};

const ACTIVE_SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due'] as const;

type TeamUsersAuthContext = {
  id: string;
  role?: string | null;
  teamId?: number | null;
  ownerId?: string | null;
  ownerInfo?: {
    ownerId?: string | null;
  } | null;
};

const resolveTeamUserLimit = async (ownerUserId: string, fallbackUserId: string) => {
  const subscription =
    (await BillingSubscription.findOne({
      userId: ownerUserId,
      isCurrent: true,
      status: { $in: ACTIVE_SUBSCRIPTION_STATUSES },
    })
      .populate({
        path: 'packageId',
        select: '_id code name limits billingCycle',
      })
      .sort({ updatedAt: -1 })
      .lean()) ||
    (await BillingSubscription.findOne({
      userId: fallbackUserId,
      isCurrent: true,
      status: { $in: ACTIVE_SUBSCRIPTION_STATUSES },
    })
      .populate({
        path: 'packageId',
        select: '_id code name limits billingCycle',
      })
      .sort({ updatedAt: -1 })
      .lean());

  if (!subscription) {
    return null as number | null;
  }

  const packageDoc = (subscription as any).packageId || null;
  return packageDoc?.limits?.users ?? null;
};

export const getTeamUsersWithPackageInfo = async (authUser: TeamUsersAuthContext | null | undefined) => {
  if (!authUser?.id) {
    return { status: 'user_not_found' as const };
  }

  if (authUser.teamId === null || authUser.teamId === undefined) {
    return { status: 'team_id_missing' as const };
  }

  const teamId = Number(authUser.teamId);
  const users = await User.find({ teamId })
    .select(
      '_id fullName email companyName role teamId ownerInfo profilePhoto phoneNumber location timeZone accessExpiresAt planType createdAt updatedAt'
    )
    .sort({ createdAt: -1 })
    .lean();

  let ownerUserId =
    authUser.role === 'OWNER'
      ? authUser.id
      : authUser.ownerId
        ? String(authUser.ownerId)
        : authUser.ownerInfo?.ownerId
          ? String(authUser.ownerInfo.ownerId)
        : null;

  if (!ownerUserId) {
    const owner = await User.findOne({ teamId, role: 'OWNER' }).select('_id').lean();
    ownerUserId = owner ? String(owner._id) : authUser.id;
  }

  const userLimit = await resolveTeamUserLimit(ownerUserId, authUser.id);
  const usedUsers = users.length;
  const remainingUsers =
    userLimit === null ? null : Math.max(userLimit - usedUsers, 0);

  return {
    status: 'ok' as const,
    data: {
      totalAllowedUsers: userLimit,
      usedUsers,
      remainingUsers,
      canCreateMoreUsers:
        userLimit === null || remainingUsers === null ? null : remainingUsers > 0,
      users,
    },
  };
};
