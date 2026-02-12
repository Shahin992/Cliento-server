import { Document, Types } from 'mongoose';

export type ContactStatus = 'lead' | 'qualified' | 'customer' | 'inactive';

export interface IContact extends Document {
  ownerId: Types.ObjectId;
  firstName: string;
  lastName?: string | null;
  photoUrl?: string | null;
  emails: string[];
  phones: string[];
  companyName?: string | null;
  jobTitle?: string | null;
  website?: string | null;
  leadSource?: 'website' | 'referral' | 'social' | 'ads' | 'manual' | 'other';
  status: ContactStatus;
  tags: string[];
  address?: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;
  notes?: string | null;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId | null;
}

export type CreateContactInput = {
  ownerId: string;
  firstName: string;
  lastName?: string | null;
  photoUrl?: string | null;
  emails?: string[];
  phones?: string[];
  companyName?: string | null;
  jobTitle?: string | null;
  website?: string | null;
  leadSource?: 'website' | 'referral' | 'social' | 'ads' | 'manual' | 'other';
  status?: ContactStatus;
  tags?: string[];
  address?: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;
  notes?: string | null;
  createdBy: string;
  updatedBy?: string | null;
};

export type UpdateContactInput = Partial<Omit<CreateContactInput, 'ownerId' | 'createdBy'>>;

export type ListContactsQuery = {
  page: number;
  limit: number;
  search?: string;
};

export type ListContactsResult = {
  contacts: IContact[];
  pagination: {
    page: number;
    limit: number;
    total?: number;
    totalPages?: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};
