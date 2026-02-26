import { Schema, model } from 'mongoose';
import { IBillingSubscription } from './subscription.interface';

const TEXT_LENGTH = {
  stripeCustomerId: 120,
  stripeSubscriptionId: 120,
  stripePriceId: 120,
  paymentMethodId: 120,
  defaultPaymentMethodId: 120,
  brand: 30,
  last4: 4,
  latestInvoiceId: 120,
  latestEventId: 120,
} as const;

const cardSchema = new Schema(
  {
    paymentMethodId: {
      type: String,
      trim: true,
      maxlength: TEXT_LENGTH.paymentMethodId,
      required: true,
    },
    brand: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: TEXT_LENGTH.brand,
      required: true,
    },
    last4: {
      type: String,
      trim: true,
      minlength: TEXT_LENGTH.last4,
      maxlength: TEXT_LENGTH.last4,
      required: true,
    },
    expMonth: { type: Number, min: 1, max: 12, required: true },
    expYear: { type: Number, min: 2000, max: 9999, required: true },
  },
  { _id: false, versionKey: false }
);

const transactionCardSchema = new Schema(
  {
    paymentMethodId: { type: String, trim: true, default: null },
    brand: { type: String, trim: true, lowercase: true, default: null },
    last4: { type: String, trim: true, default: null },
    expMonth: { type: Number, default: null },
    expYear: { type: Number, default: null },
  },
  { _id: false, versionKey: false }
);

const transactionSchema = new Schema(
  {
    stripeCustomerId: { type: String, required: true, trim: true },
    stripeSubscriptionId: { type: String, default: null, trim: true },
    stripeInvoiceId: { type: String, required: true, trim: true },
    stripePaymentIntentId: { type: String, default: null, trim: true },
    stripeChargeId: { type: String, default: null, trim: true },
    eventId: { type: String, default: null, trim: true },
    invoiceNumber: { type: String, default: null, trim: true },
    status: { type: String, default: null, trim: true },
    billingReason: { type: String, default: null, trim: true },
    currency: { type: String, default: null, trim: true },
    amountPaid: { type: Number, default: null },
    amountDue: { type: Number, default: null },
    hostedInvoiceUrl: { type: String, default: null, trim: true },
    invoicePdfUrl: { type: String, default: null, trim: true },
    invoiceCreatedAt: { type: Date, default: null },
    card: { type: transactionCardSchema, default: null },
  },
  { _id: false, versionKey: false }
);

const billingSubscriptionSchema = new Schema<IBillingSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packageId: { type: Schema.Types.ObjectId, ref: 'BillingPackage', required: true, index: true },
    stripeCustomerId: {
      type: String,
      trim: true,
      maxlength: TEXT_LENGTH.stripeCustomerId,
      required: true,
      index: true,
    },
    stripeSubscriptionId: {
      type: String,
      trim: true,
      maxlength: TEXT_LENGTH.stripeSubscriptionId,
      required: true,
      unique: true,
    },
    stripePriceId: {
      type: String,
      trim: true,
      maxlength: TEXT_LENGTH.stripePriceId,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'],
      required: true,
      default: 'incomplete',
      index: true,
    },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['usd', 'eur', 'gbp', 'bdt'], required: true },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false, index: true },
    canceledAt: { type: Date, default: null },
    trialStart: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    defaultPaymentMethodId: {
      type: String,
      trim: true,
      maxlength: TEXT_LENGTH.defaultPaymentMethodId,
      default: null,
      index: true,
    },
    cards: { type: [cardSchema], default: [] },
    transactions: { type: [transactionSchema], default: [] },
    latestInvoiceId: { type: String, default: null, trim: true, maxlength: TEXT_LENGTH.latestInvoiceId },
    latestEventId: { type: String, default: null, trim: true, maxlength: TEXT_LENGTH.latestEventId },
    isCurrent: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

billingSubscriptionSchema.index({ userId: 1, status: 1, isCurrent: 1 });
billingSubscriptionSchema.index(
  { userId: 1, isCurrent: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true } }
);

export const BillingSubscription = model<IBillingSubscription>(
  'BillingSubscription',
  billingSubscriptionSchema
);
