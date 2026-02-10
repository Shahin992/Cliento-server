"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const passwordResetOtp_model_1 = require("../modules/users/passwordResetOtp.model");
const connectDB = async () => {
    try {
        mongoose_1.default.set('strictPopulate', false);
        mongoose_1.default.set('autoIndex', true);
        const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASS}@cluster0.c60ctk1.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`;
        await mongoose_1.default.connect(uri);
        console.log(`====> Connected to DB: ${mongoose_1.default.connection.name}`);
        await passwordResetOtp_model_1.PasswordResetOtp.syncIndexes();
    }
    catch (error) {
        console.error('====> DB connection error', error);
    }
};
exports.connectDB = connectDB;
