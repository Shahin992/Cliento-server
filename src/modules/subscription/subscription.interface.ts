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

export interface ISubscriptionTransactionCard {
  paymentMethodId?: string | null;
  brand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
}

export interface ISubscriptionTransaction {
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
  stripeInvoiceId: string;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  eventId?: string | null;
  invoiceNumber?: string | null;
  status?: string | null;
  billingReason?: string | null;
  currency?: string | null;
  amountPaid?: number | null;
  amountDue?: number | null;
  hostedInvoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  invoiceCreatedAt?: Date | null;
  card?: ISubscriptionTransactionCard | null;
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
  defaultPaymentMethodId?: string | null;
  cards?: ISubscriptionCard[];
  transactions?: ISubscriptionTransaction[];
  latestInvoiceId?: string | null;
  latestEventId?: string | null;
  isCurrent: boolean;
}

export type ListSubscriptionsQuery = {
  page: number;
  limit: number;
};
