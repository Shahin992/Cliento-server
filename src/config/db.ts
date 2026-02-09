import mongoose from 'mongoose';
import { PasswordResetOtp } from '../modules/users/passwordResetOtp.model';

export const connectDB = async () => {
  try {
    mongoose.set('strictPopulate', false);
    mongoose.set('autoIndex', true);
    const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASS}@cluster0.c60ctk1.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`;
    await mongoose.connect(uri);
    console.log(`====> Connected to DB: ${mongoose.connection.name}`);
    await PasswordResetOtp.syncIndexes();
  } catch (error) {
    console.error('====> DB connection error', error);
  }
};
