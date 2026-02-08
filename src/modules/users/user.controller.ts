import { Request, Response, NextFunction } from 'express';
import { randomInt } from 'crypto';
import { z, ZodError } from 'zod';
import { loginUser, registerUser } from './user.service';
import { sendError, sendResponse } from '../../../Utils/response';
import { sendWelcomeEmail } from '../../config/email';

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
