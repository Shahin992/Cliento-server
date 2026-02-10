"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.updateProfilePhoto = exports.resetPasswordWithOtp = exports.verifyPasswordResetOtp = exports.createPasswordResetOtp = exports.loginUser = exports.registerUser = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const user_model_1 = require("./user.model");
const passwordResetOtp_model_1 = require("./passwordResetOtp.model");
const registerUser = async (payload) => {
    const user = new user_model_1.User(payload);
    await user.save();
    return user;
};
exports.registerUser = registerUser;
const loginUser = async (payload) => {
    const user = await user_model_1.User.findOne({ email: payload.email });
    if (!user) {
        return { status: 'not_found' };
    }
    if (!(await user.comparePassword(payload.password))) {
        return { status: 'invalid_password' };
    }
    const token = jsonwebtoken_1.default.sign({ id: user._id, role: user.role }, process.env.JWT_TOKEN_SECRET || 'this_is_cliento_crm_token_secret', { expiresIn: '1h' });
    return { status: 'ok', user, token };
};
exports.loginUser = loginUser;
const createPasswordResetOtp = async (email) => {
    const user = await user_model_1.User.findOne({ email });
    if (!user)
        return null;
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcryptjs_1.default.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const deleteAt = new Date(Date.now() + 10 * 60 * 1000);
    await passwordResetOtp_model_1.PasswordResetOtp.deleteMany({ email, usedAt: null });
    await passwordResetOtp_model_1.PasswordResetOtp.create({
        user: user._id,
        email,
        otpHash,
        expiresAt,
        deleteAt,
    });
    return { user, otp };
};
exports.createPasswordResetOtp = createPasswordResetOtp;
const verifyPasswordResetOtp = async (email, otp) => {
    const record = await passwordResetOtp_model_1.PasswordResetOtp.findOne({
        email,
        usedAt: null,
    }).sort({ createdAt: -1 });
    if (!record)
        return { status: 'invalid' };
    if (record.expiresAt <= new Date()) {
        return { status: 'expired' };
    }
    const ok = await bcryptjs_1.default.compare(otp, record.otpHash);
    if (!ok)
        return { status: 'invalid' };
    record.usedAt = new Date();
    await record.save();
    return { status: 'ok' };
};
exports.verifyPasswordResetOtp = verifyPasswordResetOtp;
const resetPasswordWithOtp = async (email, otp, newPassword) => {
    const record = await passwordResetOtp_model_1.PasswordResetOtp.findOne({
        email,
        usedAt: { $ne: null },
    }).sort({ createdAt: -1 });
    if (!record)
        return { status: 'invalid' };
    if (record.expiresAt <= new Date()) {
        return { status: 'expired' };
    }
    const ok = await bcryptjs_1.default.compare(otp, record.otpHash);
    if (!ok)
        return { status: 'invalid' };
    const user = await user_model_1.User.findOne({ email });
    if (!user)
        return { status: 'invalid' };
    user.password = newPassword;
    await user.save();
    await passwordResetOtp_model_1.PasswordResetOtp.deleteOne({ _id: record._id });
    return { status: 'ok', user };
};
exports.resetPasswordWithOtp = resetPasswordWithOtp;
const updateProfilePhoto = async (userId, profilePhoto) => {
    const user = await user_model_1.User.findByIdAndUpdate(userId, { profilePhoto }, { new: true });
    return user;
};
exports.updateProfilePhoto = updateProfilePhoto;
const updateProfile = async (userId, updates) => {
    const user = await user_model_1.User.findByIdAndUpdate(userId, updates, { new: true });
    return user;
};
exports.updateProfile = updateProfile;
