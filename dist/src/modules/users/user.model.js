"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = require("mongoose");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const userSchema = new mongoose_1.Schema({
    fullName: { type: String, required: true },
    companyName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MEMBER'], default: 'OWNER' },
    ownerInfo: {
        type: {
            ownerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
        },
        default: null,
    },
    profilePhoto: { type: String, default: null },
    phoneNumber: { type: String, default: null },
    location: { type: String, default: null },
    timeZone: { type: String, default: null },
    signature: { type: String, default: null },
    accessExpiresAt: { type: Date, default: null },
    planType: { type: String, enum: ['trial', 'paid'], default: 'trial' }
}, { timestamps: true, versionKey: false });
userSchema.pre('save', async function (next) {
    if (!this.isModified('password'))
        return next();
    this.password = await bcryptjs_1.default.hash(this.password, 10);
    next();
});
userSchema.methods.comparePassword = function (candidatePassword) {
    return bcryptjs_1.default.compare(candidatePassword, this.password);
};
exports.User = (0, mongoose_1.model)('User', userSchema);
