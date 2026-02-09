"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.verifyOtp = exports.forgotPassword = exports.signin = exports.signup = void 0;
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const user_service_1 = require("./user.service");
const response_1 = require("../../../Utils/response");
const email_1 = require("../../config/email");
const userSchema = zod_1.z.object({
    fullName: zod_1.z.string(),
    email: zod_1.z.string().email(),
    companyName: zod_1.z.string(),
    profilePhoto: zod_1.z.string().nullable().optional(),
    phoneNumber: zod_1.z.string().min(1),
    location: zod_1.z.string().nullable().optional(),
    timeZone: zod_1.z.string().nullable().optional(),
    signature: zod_1.z.string().nullable().optional(),
    accessExpiresAt: zod_1.z.coerce.date().nullable().optional(),
    planType: zod_1.z.enum(['trial', 'paid']).optional(),
});
const signinSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
const forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
const verifyOtpSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    otp: zod_1.z.string().length(6),
});
const resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    otp: zod_1.z.string().length(6),
    newPassword: zod_1.z.string().min(6),
});
const signup = async (req, res, next) => {
    console.log('checked request body=====>', req.body);
    try {
        const parsed = userSchema.parse(req.body);
        const tempPassword = String((0, crypto_1.randomInt)(100000, 1000000));
        const user = await (0, user_service_1.registerUser)({ ...parsed, password: tempPassword });
        void (0, email_1.sendWelcomeEmail)(user.email, user.fullName, tempPassword).catch((error) => {
            console.error('====> Failed to send welcome email', error);
        });
        const { password: _password, ...safeUser } = user.toObject();
        return (0, response_1.sendResponse)(res, {
            success: true,
            statusCode: 201,
            message: 'User registered successfully',
            data: safeUser,
        });
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 400,
                message: 'Validation failed',
                details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
            });
        }
        return (0, response_1.sendError)(res, {
            success: false,
            statusCode: 500,
            message: 'Failed to create user',
            details: error.message,
        });
    }
};
exports.signup = signup;
const signin = async (req, res, next) => {
    try {
        const parsed = signinSchema.parse(req.body);
        const result = await (0, user_service_1.loginUser)(parsed);
        if (result.status === 'not_found') {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 404,
                message: 'User not found',
            });
        }
        if (result.status === 'invalid_password') {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 401,
                message: 'Invalid password',
            });
        }
        const { password: _password, ...safeUser } = result.user.toObject();
        res.cookie('access_token', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 60 * 60 * 1000,
        });
        return (0, response_1.sendResponse)(res, {
            success: true,
            statusCode: 200,
            message: 'User logged in successfully',
            data: safeUser,
            token: result.token,
        });
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 400,
                message: 'Validation failed',
                details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
            });
        }
        return (0, response_1.sendError)(res, {
            success: false,
            statusCode: 500,
            message: 'Failed to login user',
            details: error.message,
        });
    }
};
exports.signin = signin;
const forgotPassword = async (req, res) => {
    try {
        const parsed = forgotPasswordSchema.parse(req.body);
        const result = await (0, user_service_1.createPasswordResetOtp)(parsed.email);
        if (!result) {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 404,
                message: 'User not found',
            });
        }
        void (0, email_1.sendPasswordResetOtpEmail)(result.user.email, result.user.fullName, result.otp).catch((error) => {
            console.error('====> Failed to send password reset OTP email', error);
        });
        return (0, response_1.sendResponse)(res, {
            success: true,
            statusCode: 200,
            message: 'OTP sent to email',
        });
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 400,
                message: 'Validation failed',
                details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
            });
        }
        return (0, response_1.sendError)(res, {
            success: false,
            statusCode: 500,
            message: 'Failed to send OTP',
            details: error.message,
        });
    }
};
exports.forgotPassword = forgotPassword;
const verifyOtp = async (req, res) => {
    try {
        const parsed = verifyOtpSchema.parse(req.body);
        const result = await (0, user_service_1.verifyPasswordResetOtp)(parsed.email, parsed.otp);
        if (result.status === 'expired') {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 400,
                message: 'Your OTP expired. Try again.',
            });
        }
        if (result.status !== 'ok') {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 400,
                message: 'Invalid or expired OTP',
            });
        }
        return (0, response_1.sendResponse)(res, {
            success: true,
            statusCode: 200,
            message: 'OTP verified',
        });
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 400,
                message: 'Validation failed',
                details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
            });
        }
        return (0, response_1.sendError)(res, {
            success: false,
            statusCode: 500,
            message: 'Failed to verify OTP',
            details: error.message,
        });
    }
};
exports.verifyOtp = verifyOtp;
const resetPassword = async (req, res) => {
    try {
        const parsed = resetPasswordSchema.parse(req.body);
        const result = await (0, user_service_1.resetPasswordWithOtp)(parsed.email, parsed.otp, parsed.newPassword);
        if (result.status === 'expired') {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 400,
                message: 'Your OTP expired. Try again.',
            });
        }
        if (result.status !== 'ok') {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 400,
                message: 'Invalid or expired OTP',
            });
        }
        void (0, email_1.sendPasswordResetConfirmationEmail)(result.user.email, result.user.fullName).catch((error) => {
            console.error('====> Failed to send password reset confirmation email', error);
        });
        return (0, response_1.sendResponse)(res, {
            success: true,
            statusCode: 200,
            message: 'Password reset successful',
        });
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            return (0, response_1.sendError)(res, {
                success: false,
                statusCode: 400,
                message: 'Validation failed',
                details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
            });
        }
        return (0, response_1.sendError)(res, {
            success: false,
            statusCode: 500,
            message: 'Failed to reset password',
            details: error.message,
        });
    }
};
exports.resetPassword = resetPassword;
