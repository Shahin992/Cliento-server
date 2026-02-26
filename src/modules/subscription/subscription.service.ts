import { BillingSubscription } from './subscription.model';
import { ListSubscriptionsQuery, SubscriptionStatus } from './subscription.interface';
import { BillingPackage } from '../billing/package.model';
import { getStripeCheckoutSessionSummary } from '../billing/package.service';
import {
  attachStripePaymentMethodToCustomer,
  createStripeCustomer,
  createStripeSetupIntent,
  retrieveStripeSubscription,
  retrieveStripePaymentMethod,
  setStripeCustomerDefaultPaymentMethod,
  setStripeSubscriptionDefaultPaymentMethod,
  StripeIntegrationError,
} from '../billing/stripe.service';
import { User } from '../users/user.model';
import { sendSubscriptionInvoiceEmail } from '../../config/email';

const toMajorAmount = (minorAmount: number, currency: string) => {
  const twoDecimalCurrencies = new Set(['usd', 'eur', 'gbp', 'bdt']);
  if (!twoDecimalCurrencies.has(currency.toLowerCase())) return minorAmount;
  return minorAmount / 100;
};

const normalizeCards = (cards?: Array<{
  paymentMethodId?: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
}> | null) => {
  if (!Array.isArray(cards)) return [];

  return cards.filter(
    (card): card is {
      paymentMethodId: string;
      brand: string;
      last4: string;
      expMonth: number;
      expYear: number;
    } =>
      !!card &&
      typeof card.paymentMethodId === 'string' &&
      typeof card.brand === 'string' &&
      typeof card.last4 === 'string' &&
      typeof card.expMonth === 'number' &&
      typeof card.expYear === 'number'
  );
};

const mergeCard = (
  existingCards: Array<{
    paymentMethodId: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  }>,
  nextCard: {
    paymentMethodId: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  }
) => {
  const withoutCurrent = existingCards.filter(
    (card) => card.paymentMethodId !== nextCard.paymentMethodId
  );
  return [nextCard, ...withoutCurrent];
};

const getPaymentMethodId = (value: any): string | null => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.id === 'string') return value.id;
  return null;
};

const toDateFromUnixSecondsOrNull = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000);
  if (typeof value === 'string' && /^\d+$/.test(value)) return new Date(Number(value) * 1000);
  return null;
};

const buildCardsWithDefault = (
  cards: Array<{
    paymentMethodId: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  }> | null | undefined,
  defaultPaymentMethodId: string | null
) => {
  const normalized = normalizeCards(cards);
  return normalized.map((card) => ({
    ...card,
    isDefault: Boolean(defaultPaymentMethodId) && card.paymentMethodId === defaultPaymentMethodId,
  }));
};

const dedupeCardsByPaymentMethod = (
  cards: Array<{
    paymentMethodId: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  }>
) => {
  const seen = new Set<string>();
  const unique: Array<{
    paymentMethodId: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  }> = [];

  for (const card of cards) {
    if (seen.has(card.paymentMethodId)) continue;
    seen.add(card.paymentMethodId);
    unique.push(card);
  }

  return unique;
};

const getKnownCardsForStripeCustomer = async (userId: string, stripeCustomerId?: string | null) => {
  const customerId = String(stripeCustomerId || '').trim();
  if (!customerId) return [];

  const subscriptions = await BillingSubscription.find({
    userId,
    stripeCustomerId: customerId,
  })
    .sort({ updatedAt: -1 })
    .select('cards');

  return dedupeCardsByPaymentMethod(
    subscriptions.flatMap((item) => normalizeCards(item.cards as any))
  );
};

const resolveStripeDefaultPaymentMethodId = async (stripeSubscriptionId?: string | null) => {
  const subscriptionId = String(stripeSubscriptionId || '').trim();
  if (!subscriptionId) return null;

  try {
    const stripeSubscription = await retrieveStripeSubscription(subscriptionId);
    const subscriptionDefaultPm = getPaymentMethodId(stripeSubscription?.default_payment_method);
    if (subscriptionDefaultPm) return subscriptionDefaultPm;

    const latestInvoice =
      stripeSubscription?.latest_invoice && typeof stripeSubscription.latest_invoice === 'object'
        ? stripeSubscription.latest_invoice
        : null;
    const invoicePaymentIntent =
      latestInvoice?.payment_intent && typeof latestInvoice.payment_intent === 'object'
        ? latestInvoice.payment_intent
        : null;
    const invoicePaymentMethod = getPaymentMethodId(invoicePaymentIntent?.payment_method);
    if (invoicePaymentMethod) return invoicePaymentMethod;

    const customer =
      stripeSubscription?.customer && typeof stripeSubscription.customer === 'object'
        ? stripeSubscription.customer
        : null;
    const customerDefaultPm = getPaymentMethodId(customer?.invoice_settings?.default_payment_method);
    return customerDefaultPm;
  } catch (error) {
    if (error instanceof StripeIntegrationError) {
      return null;
    }
    throw error;
  }
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

  const existingSubscription = await BillingSubscription.findOne({
    stripeSubscriptionId: session.subscriptionId,
  }).select('cards defaultPaymentMethodId');
  const existingCards = normalizeCards(existingSubscription?.cards);
  const knownCards = await getKnownCardsForStripeCustomer(userId, session.customerId);
  const cards = dedupeCardsByPaymentMethod([
    ...(card ? [card] : []),
    ...existingCards,
    ...knownCards,
  ]);
  const defaultPaymentMethodId = card
    ? card.paymentMethodId
    : (existingSubscription?.defaultPaymentMethodId ?? cards[0]?.paymentMethodId ?? null);

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
        defaultPaymentMethodId,
        cards,
        latestInvoiceId: session.latestInvoiceId || null,
        isCurrent: true,
        latestEventId: session.id,
      },
      $unset: {
        card: '',
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

const refreshSubscriptionSnapshotFromStripe = async (subscriptionObj: any) => {
  const stripeSubscriptionId = String(subscriptionObj?.stripeSubscriptionId || '').trim();
  if (!stripeSubscriptionId) {
    return {
      subscriptionObj,
      stripeDefaultPaymentMethodId: subscriptionObj?.defaultPaymentMethodId
        ? String(subscriptionObj.defaultPaymentMethodId)
        : null,
      cards: normalizeCards(subscriptionObj?.cards as any),
    };
  }

  try {
    const stripeSubscription = await retrieveStripeSubscription(stripeSubscriptionId);
    const rawStripeStatus = String(stripeSubscription?.status || '').toLowerCase();
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
      : (subscriptionObj.status as SubscriptionStatus);

    const firstItem = Array.isArray(stripeSubscription?.items?.data)
      ? stripeSubscription.items.data[0]
      : null;
    const priceObj =
      firstItem?.price && typeof firstItem.price === 'object'
        ? firstItem.price
        : null;
    const recurringInterval = String(priceObj?.recurring?.interval || '').toLowerCase();
    const billingCycle = recurringInterval === 'year'
      ? 'yearly'
      : recurringInterval === 'month'
        ? 'monthly'
        : subscriptionObj.billingCycle;
    const currency = String(priceObj?.currency || subscriptionObj.currency || 'usd').toLowerCase();
    const unitAmountMinor = Number(priceObj?.unit_amount || 0);
    const amount = unitAmountMinor > 0 ? toMajorAmount(unitAmountMinor, currency) : subscriptionObj.amount;

    const currentPeriodStart =
      toDateFromUnixSecondsOrNull(stripeSubscription?.current_period_start ?? firstItem?.current_period_start) ||
      subscriptionObj.currentPeriodStart ||
      null;
    const currentPeriodEnd =
      toDateFromUnixSecondsOrNull(stripeSubscription?.current_period_end ?? firstItem?.current_period_end) ||
      subscriptionObj.currentPeriodEnd ||
      null;
    const trialStart =
      toDateFromUnixSecondsOrNull(stripeSubscription?.trial_start) || subscriptionObj.trialStart || null;
    const trialEnd =
      toDateFromUnixSecondsOrNull(stripeSubscription?.trial_end) || subscriptionObj.trialEnd || null;
    const canceledAt =
      toDateFromUnixSecondsOrNull(stripeSubscription?.canceled_at) || subscriptionObj.canceledAt || null;
    const cancelAtPeriodEnd = Boolean(stripeSubscription?.cancel_at_period_end ?? subscriptionObj.cancelAtPeriodEnd);

    const latestInvoice =
      stripeSubscription?.latest_invoice && typeof stripeSubscription.latest_invoice === 'object'
        ? stripeSubscription.latest_invoice
        : null;
    const invoicePaymentIntent =
      latestInvoice?.payment_intent && typeof latestInvoice.payment_intent === 'object'
        ? latestInvoice.payment_intent
        : null;
    const customer =
      stripeSubscription?.customer && typeof stripeSubscription.customer === 'object'
        ? stripeSubscription.customer
        : null;
    const stripeDefaultPaymentMethodId =
      getPaymentMethodId(stripeSubscription?.default_payment_method) ||
      getPaymentMethodId(invoicePaymentIntent?.payment_method) ||
      getPaymentMethodId(customer?.invoice_settings?.default_payment_method) ||
      (subscriptionObj.defaultPaymentMethodId ? String(subscriptionObj.defaultPaymentMethodId) : null);

    let cards = normalizeCards(subscriptionObj.cards as any);
    if (stripeDefaultPaymentMethodId) {
      try {
        const paymentMethod = await retrieveStripePaymentMethod(stripeDefaultPaymentMethodId);
        if (paymentMethod?.type === 'card' && paymentMethod.card) {
          const card = {
            paymentMethodId: String(paymentMethod.id),
            brand: String(paymentMethod.card.brand || '').toLowerCase(),
            last4: String(paymentMethod.card.last4 || ''),
            expMonth: Number(paymentMethod.card.exp_month),
            expYear: Number(paymentMethod.card.exp_year),
          };
          if (card.brand && card.last4 && card.expMonth && card.expYear) {
            cards = mergeCard(cards, card);
          }
        }
      } catch {
        // Keep existing cards on Stripe retrieval failure.
      }
    }

    const stripeCustomerId =
      getPaymentMethodId(stripeSubscription?.customer) ||
      (typeof stripeSubscription?.customer === 'string'
        ? stripeSubscription.customer
        : String(subscriptionObj.stripeCustomerId || ''));
    const latestInvoiceId =
      typeof latestInvoice?.id === 'string'
        ? latestInvoice.id
        : typeof stripeSubscription?.latest_invoice === 'string'
          ? stripeSubscription.latest_invoice
          : (subscriptionObj.latestInvoiceId || null);

    await BillingSubscription.updateOne(
      { _id: subscriptionObj._id },
      {
        $set: {
          stripeCustomerId,
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
          defaultPaymentMethodId: stripeDefaultPaymentMethodId,
          cards,
          latestInvoiceId,
        },
      }
    );

    const paidStatuses = new Set<SubscriptionStatus>(['active', 'trialing', 'past_due', 'incomplete']);
    await User.findByIdAndUpdate(String(subscriptionObj.userId), {
      planType: paidStatuses.has(status) ? 'paid' : 'trial',
      accessExpiresAt: currentPeriodEnd,
    });

    return {
      subscriptionObj: {
        ...subscriptionObj,
        stripeCustomerId,
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
        defaultPaymentMethodId: stripeDefaultPaymentMethodId,
        cards,
        latestInvoiceId,
      },
      stripeDefaultPaymentMethodId,
      cards,
    };
  } catch (error) {
    if (error instanceof StripeIntegrationError) {
      return {
        subscriptionObj,
        stripeDefaultPaymentMethodId: subscriptionObj.defaultPaymentMethodId
          ? String(subscriptionObj.defaultPaymentMethodId)
          : null,
        cards: normalizeCards(subscriptionObj.cards as any),
      };
    }
    throw error;
  }
};

export const createSetupIntentForCurrentSubscription = async (userId: string) => {
  const subscription = await BillingSubscription.findOne({
    userId,
    isCurrent: true,
  }).select('_id stripeCustomerId');

  if (!subscription) {
    return { status: 'not_found' as const };
  }

  let customerId = String(subscription.stripeCustomerId || '').trim();
  try {
    if (!customerId) {
      const user = await User.findById(userId).select('email fullName companyName role teamId');
      const customer = await createStripeCustomer({
        userId,
        email: user?.email ?? null,
        fullName: user?.fullName ?? null,
        companyName: user?.companyName ?? null,
        role: user?.role ?? null,
        teamId:
          user?.teamId === null || user?.teamId === undefined
            ? null
            : String(user.teamId),
      });
      customerId = String(customer.id || '').trim();
      if (!customerId) {
        return { status: 'stripe_error' as const, message: 'Stripe customer creation failed.' };
      }

      await BillingSubscription.updateOne(
        { _id: subscription._id },
        { $set: { stripeCustomerId: customerId } }
      );
    }

    const setupIntent = await createStripeSetupIntent(customerId);
    const clientSecret = String(setupIntent.client_secret || '').trim();
    if (!clientSecret) {
      return { status: 'stripe_error' as const, message: 'Stripe setup intent missing client_secret.' };
    }

    return {
      status: 'ok' as const,
      clientSecret,
    };
  } catch (error) {
    if (error instanceof StripeIntegrationError) {
      if (error.status === 'missing_secret_key') {
        return { status: 'stripe_not_configured' as const, message: error.message };
      }
      return { status: 'stripe_error' as const, message: error.message };
    }
    throw error;
  }
};

export const attachPaymentMethodToCurrentSubscription = async (
  userId: string,
  paymentMethodId: string
) => {
  const subscription = await BillingSubscription.findOne({
    userId,
    isCurrent: true,
  }).select('_id stripeCustomerId stripeSubscriptionId cards');

  if (!subscription) {
    return { status: 'not_found' as const };
  }

  const customerId = String(subscription.stripeCustomerId || '').trim();
  if (!customerId) {
    return { status: 'customer_id_missing' as const };
  }

  try {
    await attachStripePaymentMethodToCustomer(paymentMethodId, customerId);
    await setStripeCustomerDefaultPaymentMethod(customerId, paymentMethodId);

    if (subscription.stripeSubscriptionId) {
      await setStripeSubscriptionDefaultPaymentMethod(
        String(subscription.stripeSubscriptionId),
        paymentMethodId
      );
    }

    const paymentMethod = await retrieveStripePaymentMethod(paymentMethodId);
    if (paymentMethod?.type !== 'card' || !paymentMethod.card) {
      return { status: 'invalid_payment_method' as const };
    }

    const card = {
      paymentMethodId: String(paymentMethod.id),
      brand: String(paymentMethod.card.brand || '').toLowerCase(),
      last4: String(paymentMethod.card.last4 || ''),
      expMonth: Number(paymentMethod.card.exp_month),
      expYear: Number(paymentMethod.card.exp_year),
    };

    if (!card.brand || !card.last4 || !card.expMonth || !card.expYear) {
      return { status: 'invalid_payment_method' as const };
    }

    const existingCards = normalizeCards(subscription.cards);
    const cards = mergeCard(existingCards, card);

    await BillingSubscription.updateOne(
      { _id: subscription._id },
      {
        $set: {
          cards,
          defaultPaymentMethodId: paymentMethodId,
        },
        $unset: { card: '' },
      }
    );

    return {
      status: 'ok' as const,
      data: {
        paymentMethodId: card.paymentMethodId,
      },
    };
  } catch (error) {
    if (error instanceof StripeIntegrationError) {
      if (error.status === 'missing_secret_key') {
        return { status: 'stripe_not_configured' as const, message: error.message };
      }
      return { status: 'stripe_error' as const, message: error.message };
    }
    throw error;
  }
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
  const baseSubscriptionObj = subscription.toObject();
  const refreshed = await refreshSubscriptionSnapshotFromStripe(baseSubscriptionObj);
  const subscriptionObj = refreshed.subscriptionObj;
  const knownCards = await getKnownCardsForStripeCustomer(
    String(subscriptionObj.userId),
    String(subscriptionObj.stripeCustomerId || '')
  );
  const stripeDefaultPaymentMethodId =
    refreshed.stripeDefaultPaymentMethodId ||
    (await resolveStripeDefaultPaymentMethodId(subscriptionObj.stripeSubscriptionId)) ||
    (subscriptionObj.defaultPaymentMethodId ? String(subscriptionObj.defaultPaymentMethodId) : null);
  const mergedCards = dedupeCardsByPaymentMethod([
    ...refreshed.cards,
    ...knownCards,
  ]);
  const cards = buildCardsWithDefault(mergedCards, stripeDefaultPaymentMethodId);

  if (
    stripeDefaultPaymentMethodId &&
    stripeDefaultPaymentMethodId !== String(subscriptionObj.defaultPaymentMethodId || '')
  ) {
    await BillingSubscription.updateOne(
      { _id: subscriptionObj._id },
      { $set: { defaultPaymentMethodId: stripeDefaultPaymentMethodId } }
    );
  }
  if (mergedCards.length > normalizeCards(subscriptionObj.cards as any).length) {
    await BillingSubscription.updateOne(
      { _id: subscriptionObj._id },
      { $set: { cards: mergedCards } }
    );
  }

  return {
    status: 'ok' as const,
    subscription: {
      ...subscriptionObj,
      defaultPaymentMethodId: stripeDefaultPaymentMethodId,
      cards,
    },
  };
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
  const baseSubscriptionObj = subscription.toObject();
  const refreshed = await refreshSubscriptionSnapshotFromStripe(baseSubscriptionObj);
  const subscriptionObj = refreshed.subscriptionObj;
  const knownCards = await getKnownCardsForStripeCustomer(
    String(subscriptionObj.userId),
    String(subscriptionObj.stripeCustomerId || '')
  );
  const stripeDefaultPaymentMethodId =
    refreshed.stripeDefaultPaymentMethodId ||
    (await resolveStripeDefaultPaymentMethodId(subscriptionObj.stripeSubscriptionId)) ||
    (subscriptionObj.defaultPaymentMethodId ? String(subscriptionObj.defaultPaymentMethodId) : null);
  const mergedCards = dedupeCardsByPaymentMethod([
    ...refreshed.cards,
    ...knownCards,
  ]);
  const cards = buildCardsWithDefault(mergedCards, stripeDefaultPaymentMethodId);

  if (
    stripeDefaultPaymentMethodId &&
    stripeDefaultPaymentMethodId !== String(subscriptionObj.defaultPaymentMethodId || '')
  ) {
    await BillingSubscription.updateOne(
      { _id: subscriptionObj._id },
      { $set: { defaultPaymentMethodId: stripeDefaultPaymentMethodId } }
    );
  }
  if (mergedCards.length > normalizeCards(subscriptionObj.cards as any).length) {
    await BillingSubscription.updateOne(
      { _id: subscriptionObj._id },
      { $set: { cards: mergedCards } }
    );
  }

  return {
    status: 'ok' as const,
    subscription: {
      ...subscriptionObj,
      defaultPaymentMethodId: stripeDefaultPaymentMethodId,
      cards,
    },
  };
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

  const mappedSubscriptions = subscriptions.map((subscription) => {
    const subscriptionObj = subscription.toObject();
    const defaultPaymentMethodId = subscriptionObj.defaultPaymentMethodId
      ? String(subscriptionObj.defaultPaymentMethodId)
      : null;
    const cards = buildCardsWithDefault(subscriptionObj.cards as any, defaultPaymentMethodId);

    return {
      ...subscriptionObj,
      cards,
    };
  });

  return {
    subscriptions: mappedSubscriptions,
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
