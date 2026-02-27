import { Document, Types } from 'mongoose';

export type UserRole = 'SUPER_ADMIN' | 'OWNER' | 'ADMIN' | 'MEMBER';

export interface IUser extends Document {
  fullName: string;
  companyName: string;
  email: string;
  password: string;
  role: UserRole;
  teamId?: number | null;
  ownerInfo?: {
    ownerId: Types.ObjectId;
  } | null;
  profilePhoto?: string | null;
  phoneNumber?: string | null;
  location?: string | null;
  timeZone?: string | null;
  signature?: string | null;
  accessExpiresAt?: Date | null;
  planType?: 'trial' | 'paid';
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export type UserInput = {
  fullName: string;
  email: string;
  companyName: string;
  role?: UserRole;
  profilePhoto?: string | null;
  phoneNumber: string;
  location?: string | null;
  timeZone?: string | null;
  signature?: string | null;
  accessExpiresAt?: Date | null;
  planType?: 'trial' | 'paid';
  teamId?: number | null;
  ownerInfo?: {
    ownerId: Types.ObjectId | string;
  } | null;
};

export type RegisterUserInput = UserInput & {
  password: string;
};
