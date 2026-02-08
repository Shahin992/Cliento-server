import { Request, Response, NextFunction } from 'express';
import { randomInt } from 'crypto';
import { z, ZodError } from 'zod';
import { createPasswordResetOtp, loginUser, registerUser, resetPasswordWithOtp, verifyPasswordResetOtp } from './user.service';
import { sendError, sendResponse } from '../../../Utils/response';
import { sendPasswordResetConfirmationEmail, sendPasswordResetOtpEmail, sendWelcomeEmail } from '../../config/email';

const userSchema = z.object({
  fullName: z.string(),
  email: z.string().email(),
  companyName: z.string(),
  role: z.enum(['ADMIN', 'SUPER_ADMIN', 'USER']).default('ADMIN'),
  isParentUser: z.boolean().default(true),
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


export const signup = async (req: Request, res: Response, next:NextFunction) => {
  console.log('checked request body=====>',req.body);
  try {
    const parsed = userSchema.parse(req.body);
    const tempPassword = String(randomInt(100000, 1000000));
    const user =  await registerUser({ ...parsed, password: tempPassword });
    void sendWelcomeEmail(user.email, user.fullName, tempPassword).catch((error) => {
      console.error('====> Failed to send welcome email', error);
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

export const signin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = signinSchema.parse(req.body);
    const result = await loginUser(parsed);
    if (!result) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'Unauthorized user',
      });
    }
    const { password: _password, ...safeUser } = result.user.toObject();
    res.cookie('access_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 60 * 60 * 1000,
    });
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

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const parsed = forgotPasswordSchema.parse(req.body);
    const result = await createPasswordResetOtp(parsed.email);
    if (!result) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
    }
    void sendPasswordResetOtpEmail(result.user.email, result.user.fullName, result.otp).catch((error) => {
      console.error('====> Failed to send password reset OTP email', error);
    });
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
    void sendPasswordResetConfirmationEmail(result.user.email, result.user.fullName).catch((error) => {
      console.error('====> Failed to send password reset confirmation email', error);
    });
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
