import { Document } from 'mongoose';

export type UserRole = 'ADMIN' | 'SUPER_ADMIN' | 'USER';

export interface IUser extends Document {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  isParentUser: boolean;
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
  isParentUser?: boolean;
  profilePhoto?: string | null;
  phoneNumber: string;
  location?: string | null;
  timeZone?: string | null;
  signature?: string | null;
  accessExpiresAt?: Date | null;
  planType?: 'trial' | 'paid';
};

export type RegisterUserInput = UserInput & {
  password: string;
};
