import { BillingSubscription } from './subscription.model';
import { ListSubscriptionsQuery, SubscriptionStatus } from './subscription.interface';
import { BillingPackage } from '../billing/package.model';
import { getStripeCheckoutSessionSummary } from '../billing/package.service';
import {
  attachStripePaymentMethodToCustomer,
  cancelStripeSubscriptionImmediately,
  createStripeCustomer,
  createStripeSetupIntent,
  detachStripePaymentMethodFromCustomer,
  listStripeInvoicesByCustomer,
  retrieveStripeInvoice,
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

const getKnownCardsForUser = async (userId: string, preferredStripeCustomerId?: string | null) => {
  const preferredCustomerId = String(preferredStripeCustomerId || '').trim();

  const subscriptions = await BillingSubscription.find({ userId })
    .sort({ updatedAt: -1 })
    .select('cards stripeCustomerId');

  if (!preferredCustomerId) {
    return dedupeCardsByPaymentMethod(
      subscriptions.flatMap((item) => normalizeCards(item.cards as any))
    );
  }

  const sameCustomer = subscriptions.filter(
    (item) => String(item.stripeCustomerId || '').trim() === preferredCustomerId
  );
  const otherCustomers = subscriptions.filter(
    (item) => String(item.stripeCustomerId || '').trim() !== preferredCustomerId
  );

  return dedupeCardsByPaymentMethod(
    [...sameCustomer, ...otherCustomers].flatMap((item) => normalizeCards(item.cards as any))
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
    session.subscriptionMetadata?.user_id ||
      session.metadata?.user_id ||
      session.customerMetadata?.user_id ||
      ''
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

  const previousActiveSubscriptions = await BillingSubscription.find({
    userId,
    stripeSubscriptionId: { $ne: session.subscriptionId },
    status: { $in: ['incomplete', 'trialing', 'active', 'past_due', 'unpaid'] },
  }).select('stripeSubscriptionId');

  try {
    await Promise.all(
      previousActiveSubscriptions.map(async (item) => {
        const previousStripeSubscriptionId = String(item.stripeSubscriptionId || '').trim();
        if (!previousStripeSubscriptionId) return;
        await cancelStripeSubscriptionImmediately(previousStripeSubscriptionId);
      })
    );
  } catch (error) {
    if (error instanceof StripeIntegrationError) {
      if (error.status === 'missing_secret_key') {
        return { status: 'stripe_not_configured' as const, message: error.message };
      }
      return { status: 'stripe_error' as const, message: error.message };
    }
    throw error;
  }

  await BillingSubscription.updateMany(
    { userId, stripeSubscriptionId: { $ne: session.subscriptionId } },
    {
      $set: {
        isCurrent: false,
        status: 'canceled',
        cancelAtPeriodEnd: false,
        canceledAt: new Date(),
      },
    }
  );

  const existingSubscription = await BillingSubscription.findOne({
    stripeSubscriptionId: session.subscriptionId,
  }).select('cards defaultPaymentMethodId');
  const existingCards = normalizeCards(existingSubscription?.cards);
  const knownCards = await getKnownCardsForUser(userId, session.customerId);
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
    planType: status === 'trialing' ? 'trial' : 'paid',
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

const upsertTransactionFromStripeInvoice = async (
  invoice: Record<string, any>,
  eventId?: string | null
) => {
  const stripeInvoiceId = String(invoice?.id || '').trim();
  if (!stripeInvoiceId) return { status: 'ignored' as const };

  const stripeSubscriptionId =
    typeof invoice?.subscription === 'string'
      ? invoice.subscription
      : typeof invoice?.subscription?.id === 'string'
        ? invoice.subscription.id
        : '';
  const stripeCustomerId =
    typeof invoice?.customer === 'string'
      ? invoice.customer
      : typeof invoice?.customer?.id === 'string'
        ? invoice.customer.id
        : '';

  let subscriptionDoc = null as any;
  if (stripeSubscriptionId) {
    subscriptionDoc = await BillingSubscription.findOne({
      stripeSubscriptionId: String(stripeSubscriptionId),
    }).select('_id userId stripeCustomerId');
  }
  if (!subscriptionDoc && stripeCustomerId) {
    subscriptionDoc = await BillingSubscription.findOne({
      stripeCustomerId: String(stripeCustomerId),
    })
      .sort({ updatedAt: -1 })
      .select('_id userId stripeCustomerId');
  }

  if (!subscriptionDoc) {
    return { status: 'not_mapped' as const };
  }

  const paymentIntent =
    invoice?.payment_intent && typeof invoice.payment_intent === 'object'
      ? invoice.payment_intent
      : null;
  const paymentMethod =
    paymentIntent?.payment_method && typeof paymentIntent.payment_method === 'object'
      ? paymentIntent.payment_method
      : null;
  const charge =
    invoice?.charge && typeof invoice.charge === 'object'
      ? invoice.charge
      : null;
  const card = paymentMethod?.card
    ? {
        paymentMethodId: typeof paymentMethod.id === 'string' ? paymentMethod.id : null,
        brand: paymentMethod.card?.brand ?? null,
        last4: paymentMethod.card?.last4 ?? null,
        expMonth: paymentMethod.card?.exp_month ?? null,
        expYear: paymentMethod.card?.exp_year ?? null,
      }
    : null;

  const transactionPayload = {
    stripeCustomerId: stripeCustomerId || String(subscriptionDoc.stripeCustomerId || ''),
    stripeSubscriptionId: stripeSubscriptionId || null,
    stripeInvoiceId,
    stripePaymentIntentId: typeof paymentIntent?.id === 'string' ? paymentIntent.id : null,
    stripeChargeId:
      typeof charge?.id === 'string'
        ? charge.id
        : typeof invoice?.charge === 'string'
          ? invoice.charge
          : null,
    eventId: eventId ? String(eventId) : null,
    invoiceNumber: typeof invoice?.number === 'string' ? invoice.number : null,
    status: typeof invoice?.status === 'string' ? invoice.status : null,
    billingReason: typeof invoice?.billing_reason === 'string' ? invoice.billing_reason : null,
    currency: typeof invoice?.currency === 'string' ? invoice.currency : null,
    amountPaid: typeof invoice?.amount_paid === 'number' ? invoice.amount_paid : null,
    amountDue: typeof invoice?.amount_due === 'number' ? invoice.amount_due : null,
    hostedInvoiceUrl: typeof invoice?.hosted_invoice_url === 'string' ? invoice.hosted_invoice_url : null,
    invoicePdfUrl: typeof invoice?.invoice_pdf === 'string' ? invoice.invoice_pdf : null,
    invoiceCreatedAt: typeof invoice?.created === 'number' ? new Date(invoice.created * 1000) : null,
    card,
  };

  const existing = await BillingSubscription.findOne({
    _id: subscriptionDoc._id,
    'transactions.stripeInvoiceId': stripeInvoiceId,
  }).select('_id');

  if (existing) {
    await BillingSubscription.updateOne(
      { _id: subscriptionDoc._id, 'transactions.stripeInvoiceId': stripeInvoiceId },
      {
        $set: {
          'transactions.$': transactionPayload,
          ...(eventId ? { latestEventId: String(eventId) } : {}),
          latestInvoiceId: stripeInvoiceId,
        },
      }
    );
  } else {
    await BillingSubscription.updateOne(
      { _id: subscriptionDoc._id },
      {
        $push: { transactions: transactionPayload },
        $set: {
          ...(eventId ? { latestEventId: String(eventId) } : {}),
          latestInvoiceId: stripeInvoiceId,
        },
      }
    );
  }

  return { status: 'ok' as const };
};

const backfillTransactionsForUserFromStripe = async (userId: string) => {
  const subscriptions = await BillingSubscription.find({ userId }).select(
    '_id stripeCustomerId transactions'
  );

  const customerIds = Array.from(
    new Set(
      subscriptions
        .map((subscription) => String(subscription.stripeCustomerId || '').trim())
        .filter(Boolean)
    )
  );
  if (!customerIds.length) return;

  for (const customerId of customerIds) {
    let startingAfter: string | null = null;
    do {
      const chunk = await listStripeInvoicesByCustomer(customerId, 100, startingAfter);
      for (const invoice of chunk.data) {
        await upsertTransactionFromStripeInvoice(invoice);
      }
      const lastInvoice = chunk.data.length ? chunk.data[chunk.data.length - 1] : null;
      startingAfter = chunk.hasMore && lastInvoice?.id ? String(lastInvoice.id) : null;
    } while (startingAfter);
  }
};

export const handleStripeWebhookEvent = async (event: Record<string, any>) => {
  const eventType = String(event?.type || '').trim();
  if (!eventType) {
    return { status: 'ignored' as const };
  }

  if (
    eventType !== 'invoice.paid' &&
    eventType !== 'invoice.payment_failed' &&
    eventType !== 'invoice.finalized' &&
    eventType !== 'invoice.voided' &&
    eventType !== 'invoice.marked_uncollectible'
  ) {
    return { status: 'ignored' as const };
  }

  const eventId = String(event?.id || '').trim();
  if (eventId) {
    const existingEvent = await BillingSubscription.findOne({
      'transactions.eventId': eventId,
    }).select('_id');
    if (existingEvent) {
      return { status: 'duplicate_event' as const };
    }
  }

  const eventInvoice = event?.data?.object ?? {};
  const invoiceId = String(eventInvoice?.id || '').trim();
  if (!invoiceId) {
    return { status: 'ignored' as const };
  }

  try {
    const invoice = await retrieveStripeInvoice(invoiceId);
    return upsertTransactionFromStripeInvoice(invoice, eventId || null);
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

    const paidStatuses = new Set<SubscriptionStatus>(['active', 'past_due', 'unpaid']);
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

export const setDefaultPaymentMethodForCurrentSubscription = async (
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

  const existingCards = normalizeCards(subscription.cards);
  const nextDefaultCard = existingCards.find((card) => card.paymentMethodId === paymentMethodId);
  if (!nextDefaultCard) {
    return { status: 'card_not_found' as const };
  }

  try {
    await setStripeCustomerDefaultPaymentMethod(customerId, paymentMethodId);
    if (subscription.stripeSubscriptionId) {
      await setStripeSubscriptionDefaultPaymentMethod(String(subscription.stripeSubscriptionId), paymentMethodId);
    }

    const cards = mergeCard(existingCards, nextDefaultCard);
    await BillingSubscription.updateOne(
      { _id: subscription._id },
      {
        $set: {
          defaultPaymentMethodId: paymentMethodId,
          cards,
        },
      }
    );

    return {
      status: 'ok' as const,
      data: {
        paymentMethodId,
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

export const deletePaymentMethodFromCurrentSubscription = async (
  userId: string,
  paymentMethodId: string
) => {
  const subscription = await BillingSubscription.findOne({
    userId,
    isCurrent: true,
  }).select('_id stripeCustomerId stripeSubscriptionId cards defaultPaymentMethodId');

  if (!subscription) {
    return { status: 'not_found' as const };
  }

  const customerId = String(subscription.stripeCustomerId || '').trim();
  if (!customerId) {
    return { status: 'customer_id_missing' as const };
  }

  const existingCards = normalizeCards(subscription.cards);
  const cardToDelete = existingCards.find((card) => card.paymentMethodId === paymentMethodId);
  if (!cardToDelete) {
    return { status: 'card_not_found' as const };
  }

  if (existingCards.length <= 1) {
    return { status: 'cannot_delete_last_card' as const };
  }

  const currentDefaultPaymentMethodId = String(subscription.defaultPaymentMethodId || '').trim() || null;
  const remainingCards = existingCards.filter((card) => card.paymentMethodId !== paymentMethodId);
  const nextDefaultPaymentMethodId =
    currentDefaultPaymentMethodId === paymentMethodId
      ? remainingCards[0]?.paymentMethodId || null
      : currentDefaultPaymentMethodId;

  try {
    if (nextDefaultPaymentMethodId && currentDefaultPaymentMethodId === paymentMethodId) {
      await setStripeCustomerDefaultPaymentMethod(customerId, nextDefaultPaymentMethodId);
      if (subscription.stripeSubscriptionId) {
        await setStripeSubscriptionDefaultPaymentMethod(
          String(subscription.stripeSubscriptionId),
          nextDefaultPaymentMethodId
        );
      }
    }

    await detachStripePaymentMethodFromCustomer(paymentMethodId);

    await BillingSubscription.updateMany(
      { userId },
      {
        $pull: { cards: { paymentMethodId } },
      }
    );
    await BillingSubscription.updateMany(
      { userId, defaultPaymentMethodId: paymentMethodId },
      { $set: { defaultPaymentMethodId: null } }
    );
    await BillingSubscription.updateOne(
      { _id: subscription._id },
      {
        $set: {
          cards: remainingCards,
          defaultPaymentMethodId: nextDefaultPaymentMethodId,
        },
      }
    );

    return {
      status: 'ok' as const,
      data: {
        paymentMethodId,
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
  const knownCards = await getKnownCardsForUser(
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
  const knownCards = await getKnownCardsForUser(
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

  let subscriptions = await BillingSubscription.find({ userId })
    .sort({ updatedAt: -1 })
    .populate({
      path: 'packageId',
      select: '_id code name billingCycle price isActive',
    });

  const hasAnyTransactions = subscriptions.some((subscription: any) =>
    Array.isArray(subscription.transactions) && subscription.transactions.length > 0
  );
  if (!hasAnyTransactions && subscriptions.length > 0) {
    try {
      await backfillTransactionsForUserFromStripe(userId);
      subscriptions = await BillingSubscription.find({ userId })
        .sort({ updatedAt: -1 })
        .populate({
          path: 'packageId',
          select: '_id code name billingCycle price isActive',
        });
    } catch (error) {
      if (!(error instanceof StripeIntegrationError)) {
        throw error;
      }
    }
  }

  const flattenedTransactions = subscriptions.flatMap((subscription) => {
    const subscriptionObj = subscription.toObject() as any;
    const transactions = Array.isArray(subscriptionObj.transactions)
      ? subscriptionObj.transactions
      : [];

    return transactions.map((transaction: any) => ({
      invoice: {
        id: transaction.stripeInvoiceId || null,
        number: transaction.invoiceNumber || null,
        status: transaction.status || null,
        currency: transaction.currency || null,
        amountPaid: typeof transaction.amountPaid === 'number' ? transaction.amountPaid : null,
        amountDue: typeof transaction.amountDue === 'number' ? transaction.amountDue : null,
        hostedInvoiceUrl: transaction.hostedInvoiceUrl || null,
        invoicePdfUrl: transaction.invoicePdfUrl || null,
        createdAt: transaction.invoiceCreatedAt || null,
        stripeCustomerId: transaction.stripeCustomerId || null,
        stripeSubscriptionId: transaction.stripeSubscriptionId || null,
        stripePaymentIntentId: transaction.stripePaymentIntentId || null,
      },
      card: transaction.card || null,
      subscription: {
        _id: subscriptionObj._id,
        packageId: subscriptionObj.packageId,
        stripeSubscriptionId: subscriptionObj.stripeSubscriptionId,
        status: subscriptionObj.status,
        billingCycle: subscriptionObj.billingCycle,
        amount: subscriptionObj.amount,
        currency: subscriptionObj.currency,
        currentPeriodStart: subscriptionObj.currentPeriodStart,
        currentPeriodEnd: subscriptionObj.currentPeriodEnd,
        isCurrent: subscriptionObj.isCurrent,
      },
    }));
  });

  flattenedTransactions.sort(
    (a, b) =>
      new Date(b.invoice.createdAt || 0).getTime() - new Date(a.invoice.createdAt || 0).getTime()
  );

  const total = flattenedTransactions.length;
  const totalPages = Math.ceil(total / query.limit);
  const transactions = flattenedTransactions.slice(skip, skip + query.limit);

  return {
    transactions,
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
