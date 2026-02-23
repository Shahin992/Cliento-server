import { BillingSubscription } from './subscription.model';
import { ListSubscriptionsQuery, SubscriptionStatus } from './subscription.interface';
import { BillingPackage } from '../billing/package.model';
import { getStripeCheckoutSessionSummary } from '../billing/package.service';
import { User } from '../users/user.model';
import { sendSubscriptionInvoiceEmail } from '../../config/email';

const toMajorAmount = (minorAmount: number, currency: string) => {
  const twoDecimalCurrencies = new Set(['usd', 'eur', 'gbp', 'bdt']);
  if (!twoDecimalCurrencies.has(currency.toLowerCase())) return minorAmount;
  return minorAmount / 100;
};

export const syncSubscriptionFromCheckoutSession = async (userId: string, sessionId: string) => {
  const stripeResult = await getStripeCheckoutSessionSummary(sessionId);
  if (stripeResult.status !== 'ok') {
    return stripeResult;
  }
  
  const session = stripeResult.session;
  const paymentStatus = String(session.paymentStatus || '').toLowerCase();
  const checkoutStatus = String(session.status || '').toLowerCase();

  if (checkoutStatus !== 'complete') {
    return { status: 'checkout_not_completed' as const };
  }

  if (!['paid', 'no_payment_required'].includes(paymentStatus)) {
    return { status: 'payment_not_successful' as const };
  }

  if (!session.subscriptionId) {
    return { status: 'subscription_id_missing' as const };
  }
  if (!session.customerId) {
    return { status: 'customer_id_missing' as const };
  }
  if (!session.lineItem?.priceId) {
    return { status: 'price_id_missing' as const };
  }
  const sessionUserId = String(
    session.subscriptionMetadata?.user_id || session.metadata?.user_id || ''
  ).trim();
  if (sessionUserId && sessionUserId !== userId) {
    return { status: 'checkout_user_mismatch' as const };
  }

  const packageCodeFromMeta = String(
    session.subscriptionMetadata?.package_code || session.metadata?.package_code || ''
  ).trim().toLowerCase();

  let packageDoc = null as any;
  if (packageCodeFromMeta) {
    packageDoc = await BillingPackage.findOne({ code: packageCodeFromMeta }).select('_id');
  }
  if (!packageDoc && session.lineItem?.productId) {
    packageDoc = await BillingPackage.findOne({
      stripeProductId: String(session.lineItem.productId),
    }).select('_id');
  }
  if (!packageDoc) {
    return { status: 'package_not_found' as const };
  }

  const currency = String(session.lineItem?.currency || 'usd').toLowerCase();
  const unitAmountMinor = Number(session.lineItem?.unitAmount || 0);
  const recurringInterval = String(session.lineItem?.recurringInterval || 'month').toLowerCase();
  const rawStripeStatus = String(session.subscriptionStatus || '').toLowerCase();
  const allowedStatuses = new Set<SubscriptionStatus>([
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
  ]);
  const status = allowedStatuses.has(rawStripeStatus as SubscriptionStatus)
    ? (rawStripeStatus as SubscriptionStatus)
    : (paymentStatus === 'paid' ? 'active' : 'trialing');
  const billingCycle = recurringInterval === 'year' ? 'yearly' : 'monthly';
  const amount = toMajorAmount(unitAmountMinor, currency);
  const currentPeriodStart = session.subscriptionCurrentPeriodStart || null;
  const currentPeriodEnd = session.subscriptionCurrentPeriodEnd || null;
  const trialStart = session.subscriptionTrialStart || null;
  const trialEnd = session.subscriptionTrialEnd || null;
  const canceledAt = session.subscriptionCanceledAt || null;
  const cancelAtPeriodEnd = Boolean(session.subscriptionCancelAtPeriodEnd);
  const card = session.card &&
    typeof session.card.paymentMethodId === 'string' &&
    typeof session.card.brand === 'string' &&
    typeof session.card.last4 === 'string' &&
    typeof session.card.expMonth === 'number' &&
    typeof session.card.expYear === 'number'
    ? {
        paymentMethodId: session.card.paymentMethodId,
        brand: session.card.brand,
        last4: session.card.last4,
        expMonth: session.card.expMonth,
        expYear: session.card.expYear,
      }
    : null;

  await BillingSubscription.updateMany(
    { userId, isCurrent: true, stripeSubscriptionId: { $ne: session.subscriptionId } },
    { $set: { isCurrent: false } }
  );

  const subscription = await BillingSubscription.findOneAndUpdate(
    { stripeSubscriptionId: session.subscriptionId },
    {
      $set: {
        userId,
        packageId: packageDoc._id,
        stripeCustomerId: String(session.customerId),
        stripePriceId: String(session.lineItem.priceId),
        status,
        billingCycle,
        amount,
        currency,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        canceledAt,
        trialStart,
        trialEnd,
        card,
        latestInvoiceId: session.latestInvoiceId || null,
        isCurrent: true,
        latestEventId: session.id,
      },
    },
    { new: true, upsert: true }
  ).populate({
    path: 'packageId',
    select: '_id code name billingCycle price hasTrial trialPeriodDays isActive',
  });

  await User.findByIdAndUpdate(userId, {
    planType: 'paid',
    accessExpiresAt: currentPeriodEnd,
  });

  const userProfile = await User.findById(userId).select('email fullName');
  const receiverEmail = (session.customerEmail || userProfile?.email || '').trim();
  if (receiverEmail) {
    try {
      await sendSubscriptionInvoiceEmail(receiverEmail, userProfile?.fullName || '', {
        invoiceId: session.invoice?.id || session.latestInvoiceId || null,
        invoiceNumber: session.invoice?.number || null,
        status: session.invoice?.status || null,
        amountPaid:
          typeof session.invoice?.amountPaid === 'number'
            ? session.invoice.amountPaid
            : typeof session.lineItem?.unitAmount === 'number'
              ? session.lineItem.unitAmount
              : null,
        currency: session.invoice?.currency || session.lineItem?.currency || null,
        hostedInvoiceUrl: session.invoice?.hostedInvoiceUrl || null,
        invoicePdfUrl: session.invoice?.invoicePdfUrl || null,
        createdAt: session.invoice?.createdAt || null,
      });
    } catch (error) {
      console.error(`====> Failed to send subscription invoice email: ${(error as Error).message}`);
    }
  }

  return { status: 'ok' as const, subscription };
};

export const getCurrentSubscription = async (userId: string) => {
  const subscription = await BillingSubscription.findOne({
    userId,
    isCurrent: true,
  })
    .populate({
      path: 'packageId',
      select: '_id code name billingCycle price hasTrial trialPeriodDays isActive',
    })
    .sort({ updatedAt: -1 });

  if (!subscription) {
    return { status: 'not_found' as const };
  }

  return { status: 'ok' as const, subscription };
};

export const getSubscriptionById = async (userId: string, subscriptionId: string) => {
  const subscription = await BillingSubscription.findOne({
    _id: subscriptionId,
    userId,
  }).populate({
    path: 'packageId',
    select: '_id code name billingCycle price hasTrial trialPeriodDays isActive',
  });

  if (!subscription) {
    return { status: 'not_found' as const };
  }

  return { status: 'ok' as const, subscription };
};

export const listSubscriptions = async (userId: string, query: ListSubscriptionsQuery) => {
  const skip = (query.page - 1) * query.limit;

  const [subscriptions, total] = await Promise.all([
    BillingSubscription.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate({
        path: 'packageId',
        select: '_id code name billingCycle price isActive',
      }),
    BillingSubscription.countDocuments({ userId }),
  ]);

  const totalPages = Math.ceil(total / query.limit);

  return {
    subscriptions,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPrevPage: query.page > 1,
    },
  };
};
