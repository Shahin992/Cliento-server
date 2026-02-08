import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    mongoose.set('strictPopulate', false);
    const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASS}@cluster0.c60ctk1.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`;
    await mongoose.connect(uri);
    console.log(`====> Connected to DB: ${mongoose.connection.name}`);
  } catch (error) {
    console.error('====> DB connection error', error);
  }
};
