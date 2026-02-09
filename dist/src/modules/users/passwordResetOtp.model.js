"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordResetOtp = void 0;
const mongoose_1 = require("mongoose");
const passwordResetOtpSchema = new mongoose_1.Schema({
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    deleteAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
passwordResetOtpSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0 });
exports.PasswordResetOtp = (0, mongoose_1.model)('PasswordResetOtp', passwordResetOtpSchema);
