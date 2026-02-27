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

type CreateTeamUserInput = {
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  role?: 'ADMIN' | 'MEMBER';
};

type UpdateTeamUserInput = {
  fullName?: string;
  phoneNumber?: string;
  role?: 'ADMIN' | 'MEMBER';
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
  companyName?: string | null;
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

const resolveTeamOwnerId = async (authUser: TeamUsersAuthContext, teamId: number) => {
  if (authUser.role === 'OWNER') return authUser.id;
  if (authUser.ownerId) return String(authUser.ownerId);
  if (authUser.ownerInfo?.ownerId) return String(authUser.ownerInfo.ownerId);

  const owner = await User.findOne({ teamId, role: 'OWNER' }).select('_id').lean();
  return owner ? String(owner._id) : null;
};

export const createTeamUser = async (
  authUser: TeamUsersAuthContext | null | undefined,
  payload: CreateTeamUserInput
) => {
  if (!authUser?.id) {
    return { status: 'user_not_found' as const };
  }

  if (authUser.teamId === null || authUser.teamId === undefined) {
    return { status: 'team_id_missing' as const };
  }

  const teamId = Number(authUser.teamId);
  const ownerId = await resolveTeamOwnerId(authUser, teamId);
  if (!ownerId) {
    return { status: 'owner_not_found' as const };
  }

  const existingUser = await User.findOne({ email: payload.email.toLowerCase().trim() }).select('_id');
  if (existingUser) {
    return { status: 'email_exists' as const };
  }

  const userLimit = await resolveTeamUserLimit(ownerId, authUser.id);
  const usedUsers = await User.countDocuments({ teamId });
  if (userLimit !== null && usedUsers >= userLimit) {
    return {
      status: 'team_user_limit_reached' as const,
      limit: userLimit,
      usedUsers,
    };
  }

  const tempPassword = String(Math.floor(100000 + Math.random() * 900000));
  const userRole: 'ADMIN' | 'MEMBER' = payload.role === 'ADMIN' ? 'ADMIN' : 'MEMBER';
  const createdUser = await registerUser({
    fullName: payload.fullName,
    email: payload.email.toLowerCase().trim(),
    companyName: authUser.companyName ? String(authUser.companyName).trim() : '',
    phoneNumber: payload.phoneNumber?.trim() || '',
    location: null,
    timeZone: null,
    profilePhoto: null,
    password: tempPassword,
    role: userRole as any,
    teamId,
    ownerInfo: { ownerId } as any,
    planType: 'trial',
  } as any);

  return {
    status: 'ok' as const,
    user: createdUser,
    tempPassword,
  };
};

const findTeamUserById = (teamId: number, userId: string) => {
  return User.findOne({ _id: userId, teamId });
};

export const updateTeamUser = async (
  authUser: TeamUsersAuthContext | null | undefined,
  targetUserId: string,
  payload: UpdateTeamUserInput
) => {
  if (!authUser?.id) {
    return { status: 'user_not_found' as const };
  }

  if (authUser.teamId === null || authUser.teamId === undefined) {
    return { status: 'team_id_missing' as const };
  }

  const teamId = Number(authUser.teamId);
  const targetUser = await findTeamUserById(teamId, targetUserId);
  if (!targetUser) {
    return { status: 'target_not_found' as const };
  }

  if (targetUser.role === 'OWNER') {
    return { status: 'cannot_modify_owner' as const };
  }

  if (authUser.role === 'ADMIN') {
    if (targetUser.role === 'ADMIN') {
      return { status: 'forbidden' as const };
    }
    if (payload.role === 'ADMIN') {
      return { status: 'forbidden' as const };
    }
  }

  if (payload.fullName !== undefined) targetUser.fullName = payload.fullName.trim();
  if (payload.phoneNumber !== undefined) targetUser.phoneNumber = payload.phoneNumber.trim();
  if (payload.role !== undefined) targetUser.role = payload.role;

  await targetUser.save();
  return {
    status: 'ok' as const,
    user: targetUser,
  };
};

export const deleteTeamUser = async (authUser: TeamUsersAuthContext | null | undefined, targetUserId: string) => {
  if (!authUser?.id) {
    return { status: 'user_not_found' as const };
  }

  if (authUser.teamId === null || authUser.teamId === undefined) {
    return { status: 'team_id_missing' as const };
  }

  if (authUser.id === targetUserId) {
    return { status: 'cannot_delete_self' as const };
  }

  const teamId = Number(authUser.teamId);
  const targetUser = await findTeamUserById(teamId, targetUserId).select('_id fullName email role');
  if (!targetUser) {
    return { status: 'target_not_found' as const };
  }

  if (targetUser.role === 'OWNER') {
    return { status: 'cannot_modify_owner' as const };
  }

  if (authUser.role === 'ADMIN' && targetUser.role === 'ADMIN') {
    return { status: 'forbidden' as const };
  }

  await User.deleteOne({ _id: targetUser._id });

  const teamUsers = await User.find({ teamId })
    .select('email fullName')
    .lean();

  return {
    status: 'ok' as const,
    deletedUser: {
      id: String(targetUser._id),
      fullName: targetUser.fullName,
      email: targetUser.email,
      role: targetUser.role,
    },
    recipients: teamUsers
      .filter((item) => item.email)
      .map((item) => ({
        email: String(item.email),
        name: item.fullName ? String(item.fullName) : '',
      })),
  };
};
