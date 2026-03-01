import { Request, Response, NextFunction } from 'express';
import { randomInt } from 'crypto';
import { z, ZodError } from 'zod';
import { changePassword, createPasswordResetOtp, createTeamUser, deleteTeamUser, getMyProfile, getTeamUsersWithPackageInfo, loginUser, registerUser, resetPasswordWithOtp, updateProfile, updateProfilePhoto, updateTeamUser, verifyPasswordResetOtp } from './user.service';
import { sendError, sendResponse } from '../../../Utils/response';
import { canSendEmail, sendPasswordResetConfirmationEmail, sendPasswordResetOtpEmail, sendTeamUserDeletedEmail, sendWelcomeEmail } from '../../config/email';

const userSchema = z.object({
  fullName: z.string(),
  email: z.string().email(),
  companyName: z.string(),
  profilePhoto: z.string().nullable().optional(),
  phoneNumber: z.string().min(1),
  location: z.string().nullable().optional(),
  timeZone: z.string().nullable().optional(),
  signature: z.string().nullable().optional(),
  accessExpiresAt: z.coerce.date().nullable().optional(),
  planType: z.enum(['trial', 'paid']).optional(),
});

const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(6),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
});
const updateProfilePhotoSchema = z.object({
  profilePhoto: z.string().nullable(),
});

const updateProfileSchema = z.object({
  fullName: z.string().min(1).optional(),
  companyName: z.string().min(1).optional(),
  phoneNumber: z.string().min(1).optional(),
  location: z.string().nullable().optional(),
  timeZone: z.string().nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

const createTeamUserSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phoneNumber: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
});
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const updateTeamUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  phoneNumber: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

export const signup = async (req: Request, res: Response, next:NextFunction) => {
  try {
    if (typeof req.body?.role === 'string' && req.body.role.trim().toUpperCase() === 'SUPER_ADMIN') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'SUPER_ADMIN account cannot be created via signup',
      });
    }

    const parsed = userSchema.parse(req.body);
    const tempPassword = String(randomInt(100000, 1000000));
    const user =  await registerUser({ ...parsed, password: tempPassword });
   await  sendWelcomeEmail(user.email, user.fullName, tempPassword, { flow: 'signup' }).catch((error: Error & { code?: string }) => {
      console.error(`====> Failed to send welcome email (${error.code || 'unknown'}) ${error.message}`);
    });
    const { password: _password, ...safeUser } = user.toObject();
    return sendResponse(res, {
      success: true,
      statusCode: 201,
      message: 'User registered successfully',
      data: safeUser,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to create user',
      details: (error as Error).message,
    });
  }
};

export const createTeamUserHandler = async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.id) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = createTeamUserSchema.parse(req.body);
    const result = await createTeamUser(authUser, parsed);

    if (result.status === 'user_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
    }
    if (result.status === 'team_id_missing') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Team id not found for this user',
      });
    }
    if (result.status === 'owner_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Owner user not found for this team',
      });
    }
    if (result.status === 'email_exists') {
      return sendError(res, {
        success: false,
        statusCode: 409,
        message: 'Email already exists',
      });
    }
    if (result.status === 'team_user_limit_reached') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Team user limit reached for your package',
        details: `Allowed: ${result.limit}, Used: ${result.usedUsers}`,
      });
    }

    await sendWelcomeEmail(result.user.email, result.user.fullName, result.tempPassword, { flow: 'team_invite' }).catch((error: Error & { code?: string }) => {
      console.error(`====> Failed to send welcome email (${error.code || 'unknown'}) ${error.message}`);
    });

    const { password: _password, ...safeUser } = result.user.toObject();
    return sendResponse(res, {
      success: true,
      statusCode: 201,
      message: 'Team user created successfully',
      data: safeUser,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to create team user',
      details: (error as Error).message,
    });
  }
};

export const updateTeamUserHandler = async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.id) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const targetUserId = objectIdSchema.parse(req.params.userId);
    const parsed = updateTeamUserSchema.parse(req.body);
    const result = await updateTeamUser(authUser, targetUserId, parsed);

    if (result.status === 'user_not_found') {
      return sendError(res, { success: false, statusCode: 404, message: 'User not found' });
    }
    if (result.status === 'team_id_missing') {
      return sendError(res, { success: false, statusCode: 400, message: 'Team id not found for this user' });
    }
    if (result.status === 'target_not_found') {
      return sendError(res, { success: false, statusCode: 404, message: 'Target user not found in your team' });
    }
    if (result.status === 'cannot_modify_owner') {
      return sendError(res, { success: false, statusCode: 400, message: 'Owner user cannot be modified' });
    }
    if (result.status === 'forbidden') {
      return sendError(res, { success: false, statusCode: 403, message: 'You are not authorized to update this user' });
    }

    const { password: _password, ...safeUser } = result.user.toObject();
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Team user updated successfully',
      data: safeUser,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to update team user',
      details: (error as Error).message,
    });
  }
};

export const deleteTeamUserHandler = async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.id) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const targetUserId = objectIdSchema.parse(req.params.userId);
    const result = await deleteTeamUser(authUser, targetUserId);

    if (result.status === 'user_not_found') {
      return sendError(res, { success: false, statusCode: 404, message: 'User not found' });
    }
    if (result.status === 'team_id_missing') {
      return sendError(res, { success: false, statusCode: 400, message: 'Team id not found for this user' });
    }
    if (result.status === 'cannot_delete_self') {
      return sendError(res, { success: false, statusCode: 400, message: 'You cannot delete your own account from this route' });
    }
    if (result.status === 'target_not_found') {
      return sendError(res, { success: false, statusCode: 404, message: 'Target user not found in your team' });
    }
    if (result.status === 'cannot_modify_owner') {
      return sendError(res, { success: false, statusCode: 400, message: 'Owner user cannot be deleted' });
    }
    if (result.status === 'forbidden') {
      return sendError(res, { success: false, statusCode: 403, message: 'You are not authorized to delete this user' });
    }

    if (canSendEmail() && result.recipients.length) {
      await sendTeamUserDeletedEmail(
        result.recipients,
        result.deletedUser.fullName,
        result.deletedUser.email,
        authUser.fullName ? String(authUser.fullName) : 'A team admin'
      ).catch((error: Error & { code?: string }) => {
        console.error(`====> Failed to send team delete notification email (${error.code || 'unknown'}) ${error.message}`);
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Team user deleted successfully',
      data: result.deletedUser,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to delete team user',
      details: (error as Error).message,
    });
  }
};

export const signin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = signinSchema.parse(req.body);
    const result = await loginUser(parsed);
    if (result.status === 'not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
    }
    if (result.status === 'invalid_password') {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'Invalid password',
      });
    }
    const { password: _password, ...safeUser } = result.user.toObject();
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'User logged in successfully',
      data: safeUser,
      token: result.token,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to login user',
      details: (error as Error).message,
    });
  }
};

export const logout = async (_req: Request, res: Response) => {
  try {
    res.clearCookie('cliento_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'User logged out successfully',
    });
  } catch (error) {
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to logout user',
      details: (error as Error).message,
    });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    if (!canSendEmail()) {
      return sendError(res, {
        success: false,
        statusCode: 500,
        message: 'Email service is not configured',
      });
    }

    const parsed = forgotPasswordSchema.parse(req.body);
    const result = await createPasswordResetOtp(parsed.email);
    if (!result) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
    }
    await sendPasswordResetOtpEmail(result.user.email, result.user.fullName, result.otp);
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'OTP sent to email',
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to send OTP',
      details: (error as Error).message,
    });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const parsed = verifyOtpSchema.parse(req.body);
    const result = await verifyPasswordResetOtp(parsed.email, parsed.otp);
    if (result.status === 'expired') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Your OTP expired. Try again.',
      });
    }
    if (result.status !== 'ok') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Invalid or expired OTP',
      });
    }
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'OTP verified',
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to verify OTP',
      details: (error as Error).message,
    });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const parsed = resetPasswordSchema.parse(req.body);
    const result = await resetPasswordWithOtp(parsed.email, parsed.otp, parsed.newPassword);
    if (result.status === 'expired') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Your OTP expired. Try again.',
      });
    }
    if (result.status !== 'ok') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Invalid or expired OTP',
      });
    }

    let confirmationEmailSent = false;
    if (canSendEmail()) {
      try {
        await sendPasswordResetConfirmationEmail(result.user.email, result.user.fullName);
        confirmationEmailSent = true;
      } catch (error) {
        const emailError = error as Error & { code?: string };
        console.error(`====> Failed to send password reset confirmation email (${emailError.code || 'unknown'}) ${emailError.message}`);
      }
    } else {
      console.warn('====> Password reset confirmation email not sent: email service is not configured');
    }

    if (!confirmationEmailSent) {
      return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: 'Password reset successful, but confirmation email could not be sent',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Password reset successful',
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to reset password',
      details: (error as Error).message,
    });
  }
};

export const updateProfilePhotoHandler = async (req: Request, res: Response) => {
  try {
    const parsed = updateProfilePhotoSchema.parse(req.body);
    const userId = (req as any).user?.id;
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }
    const user = await updateProfilePhoto(userId, parsed.profilePhoto);
    if (!user) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
    }
    const { password: _password, ...safeUser } = user.toObject();
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Profile photo updated successfully',
      data: safeUser,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to update profile photo',
      details: (error as Error).message,
    });
  }
};

export const updateProfileHandler = async (req: Request, res: Response) => {
  try {
    const parsed = updateProfileSchema.parse(req.body);
    const userId = (req as any).user?.id;
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }
    const user = await updateProfile(userId, parsed);
    if (!user) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
    }
    const { password: _password, ...safeUser } = user.toObject();
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Profile updated successfully',
      data: safeUser,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to update profile',
      details: (error as Error).message,
    });
  }
};

export const changePasswordHandler = async (req: Request, res: Response) => {
  try {
    const parsed = changePasswordSchema.parse(req.body);
    const userId = (req as any).user?.id;
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }
    const result = await changePassword(userId, parsed.currentPassword, parsed.newPassword);
    if (result.status === 'not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
    }
    if (result.status === 'invalid_password') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Current password is incorrect',
      });
    }
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Password changed successfully',
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to change password',
      details: (error as Error).message,
    });
  }
};

export const getMyProfileHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const user = await getMyProfile(userId);
    if (!user) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
    }

    const { password: _password, ...safeUser } = user.toObject();
    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Profile fetched successfully',
      data: safeUser,
    });
  } catch (error) {
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to fetch profile',
      details: (error as Error).message,
    });
  }
};

export const getTeamUsersHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const result = await getTeamUsersWithPackageInfo((req as any).user);
    if (result.status === 'user_not_found') {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
    }
    if (result.status === 'team_id_missing') {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Team id not found for this user',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Team users fetched successfully',
      data: result.data,
    });
  } catch (error) {
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to fetch team users',
      details: (error as Error).message,
    });
  }
};
