import { Document, Types } from 'mongoose';
import { BillingCurrency, BillingCycle } from '../billing/package.interface';

export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid';

export interface ISubscriptionCard {
  paymentMethodId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface IBillingSubscription extends Document {
  userId: Types.ObjectId;
  packageId: Types.ObjectId;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  amount: number;
  currency: BillingCurrency;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
  card?: ISubscriptionCard | null;
  latestInvoiceId?: string | null;
  latestEventId?: string | null;
  isCurrent: boolean;
}

export type ListSubscriptionsQuery = {
  page: number;
  limit: number;
};
