import { Schema, model } from 'mongoose';
import { IPackage } from './package.interface';

const PACKAGE_TEXT_LENGTH = {
  code: 40,
  name: 80,
  description: 500,
  stripeProductId: 120,
  stripePaymentLinkId: 120,
  stripePriceId: 120,
  buyLinkUrl: 2048,
  feature: 100,
} as const;

const limitsSchema = new Schema(
  {
    users: { type: Number, default: null, min: 1 },
  },
  { _id: false, versionKey: false }
);

const priceSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['usd', 'eur', 'gbp', 'bdt'], required: true },
    stripePriceId: {
      type: String,
      trim: true,
      required: true,
      maxlength: PACKAGE_TEXT_LENGTH.stripePriceId,
    },
  },
  { _id: false, versionKey: false }
);

const packageSchema = new Schema<IPackage>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: PACKAGE_TEXT_LENGTH.code,
    },
    name: { type: String, required: true, trim: true, maxlength: PACKAGE_TEXT_LENGTH.name },
    description: { type: String, default: null, maxlength: PACKAGE_TEXT_LENGTH.description },
    stripeProductId: {
      type: String,
      required: true,
      trim: true,
      maxlength: PACKAGE_TEXT_LENGTH.stripeProductId,
    },
    stripePaymentLinkId: {
      type: String,
      required: true,
      trim: true,
      maxlength: PACKAGE_TEXT_LENGTH.stripePaymentLinkId,
    },
    buyLinkUrl: {
      type: String,
      required: true,
      trim: true,
      maxlength: PACKAGE_TEXT_LENGTH.buyLinkUrl,
    },
    hasTrial: { type: Boolean, default: true },
    trialPeriodDays: { type: Number, default: 14, min: 0, max: 90 },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true, index: true },
    price: { type: priceSchema, required: true },
    limits: { type: limitsSchema, default: () => ({}) },
    features: {
      type: [{ type: String, trim: true, maxlength: PACKAGE_TEXT_LENGTH.feature }],
      default: [],
    },
    isActive: { type: Boolean, default: true, index: true },
    isDefault: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

packageSchema.index({ code: 1 }, { unique: true });
packageSchema.index({ stripePaymentLinkId: 1 }, { unique: true });
packageSchema.index(
  { isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
);

packageSchema.pre('validate', function (this: IPackage, next) {
  if (!this.hasTrial && this.trialPeriodDays !== 0) {
    this.trialPeriodDays = 0;
  }
  if (this.hasTrial && this.trialPeriodDays <= 0) {
    return next(new Error('trialPeriodDays must be greater than 0 when hasTrial is true.'));
  }
  next();
});

export const BillingPackage = model<IPackage>('BillingPackage', packageSchema);
