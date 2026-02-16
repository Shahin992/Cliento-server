import { Document, Types } from 'mongoose';

export type BillingCurrency = 'usd' | 'eur' | 'gbp' | 'bdt';
export type BillingCycle = 'monthly' | 'yearly';

export interface IPackageLimits {
  users: number | null;
}

export interface IPackagePrice {
  amount: number;
  currency: BillingCurrency;
  stripePriceId: string;
}

export interface IPackagePriceInput {
  amount: number;
  currency: BillingCurrency;
}

export interface IPackage extends Document {
  code: string;
  name: string;
  description?: string | null;
  stripeProductId: string;
  stripePaymentLinkId: string;
  buyLinkUrl: string;
  hasTrial: boolean;
  trialPeriodDays: number;
  billingCycle: BillingCycle;
  price: IPackagePrice;
  limits: IPackageLimits;
  features: string[];
  isActive: boolean;
  isDefault: boolean;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
}

export type CreatePackageInput = {
  code: string;
  name: string;
  description?: string | null;
  hasTrial?: boolean;
  trialPeriodDays?: number;
  billingCycle: BillingCycle;
  price: IPackagePriceInput;
  limits?: Partial<IPackageLimits>;
  features?: string[];
  isActive?: boolean;
  isDefault?: boolean;
  createdBy: string;
  updatedBy: string;
};

export type UpdatePackageInput = Omit<CreatePackageInput, 'createdBy'> & {
  packageId: string;
};
