import { CreatePackageInput, UpdatePackageInput } from './package.interface';
import { BillingPackage } from './package.model';
import { BillingSubscription } from '../subscription/subscription.model';
import { User } from '../users/user.model';
import {
  createStripeCustomer,
  createStripeCatalog,
  createStripeCheckoutSession,
  deactivateStripeCatalog,
  deactivateStripePaymentLink,
  retrieveStripeCheckoutSession,
  retrieveStripeSubscription,
  rollbackStripeCatalog,
  StripeIntegrationError,
} from './stripe.service';

export const createBillingPackage = async (payload: CreatePackageInput) => {
  const packageCode = payload.code.trim().toLowerCase();

  const existing = await BillingPackage.findOne({ code: packageCode }).select('_id');
  if (existing) {
    return { status: 'package_code_exists' as const };
  }

  try {
    const stripe = await createStripeCatalog({
      code: packageCode,
      name: payload.name.trim(),
      description: payload.description ?? null,
      hasTrial: payload.hasTrial ?? true,
      trialPeriodDays: payload.trialPeriodDays ?? 14,
      billingCycle: payload.billingCycle,
      price: payload.price,
    });

    try {
      if (!stripe.stripePriceId) {
        throw new Error('Stripe price was not created.');
      }
      if (!stripe.stripePaymentLinkId || !stripe.buyLinkUrl) {
        throw new Error('Stripe payment link was not created.');
      }

      const packageDoc = await BillingPackage.create({
        code: packageCode,
        name: payload.name.trim(),
        description: payload.description ?? null,
        stripeProductId: stripe.stripeProductId,
        stripePaymentLinkId: stripe.stripePaymentLinkId,
        buyLinkUrl: stripe.buyLinkUrl,
        hasTrial: payload.hasTrial ?? true,
        trialPeriodDays: payload.trialPeriodDays ?? 14,
        billingCycle: payload.billingCycle,
        price: {
          ...payload.price,
          stripePriceId: String(stripe.stripePriceId),
        },
        limits: {
          users: payload.limits?.users ?? null,
        },
        features: payload.features ?? [],
        isActive: payload.isActive ?? true,
        isDefault: payload.isDefault ?? false,
        createdBy: payload.createdBy,
        updatedBy: payload.updatedBy,
      });

      return { status: 'ok' as const, package: packageDoc };
    } catch (dbError) {
      await rollbackStripeCatalog(
        stripe.stripeProductId,
        stripe.stripePriceId,
        stripe.stripePaymentLinkId
      );
      throw dbError;
    }
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

export const updateBillingPackage = async (payload: UpdatePackageInput) => {
  const packageCode = payload.code.trim().toLowerCase();

  const existingPackage = await BillingPackage.findById(payload.packageId);
  if (!existingPackage) {
    return { status: 'package_not_found' as const };
  }

  if (existingPackage.code !== packageCode) {
    const duplicate = await BillingPackage.findOne({
      code: packageCode,
      _id: { $ne: payload.packageId },
    }).select('_id');
    if (duplicate) {
      return { status: 'package_code_exists' as const };
    }
  }

  try {
    const stripe = await createStripeCatalog({
      code: packageCode,
      name: payload.name.trim(),
      description: payload.description ?? null,
      hasTrial: payload.hasTrial ?? true,
      trialPeriodDays: payload.trialPeriodDays ?? 14,
      billingCycle: payload.billingCycle,
      price: payload.price,
    });

    try {
      if (!stripe.stripePriceId || !stripe.stripePaymentLinkId || !stripe.buyLinkUrl) {
        throw new Error('Stripe catalog was not fully created.');
      }

      const previousStripeProductId = existingPackage.stripeProductId;
      const previousStripePriceId = existingPackage.price?.stripePriceId;
      const previousStripePaymentLinkId = existingPackage.stripePaymentLinkId;

      existingPackage.code = packageCode;
      existingPackage.name = payload.name.trim();
      existingPackage.description = payload.description ?? null;
      existingPackage.stripeProductId = stripe.stripeProductId;
      existingPackage.stripePaymentLinkId = stripe.stripePaymentLinkId;
      existingPackage.buyLinkUrl = stripe.buyLinkUrl;
      existingPackage.hasTrial = payload.hasTrial ?? true;
      existingPackage.trialPeriodDays = payload.trialPeriodDays ?? 14;
      existingPackage.billingCycle = payload.billingCycle;
      existingPackage.price = {
        ...payload.price,
        stripePriceId: String(stripe.stripePriceId),
      };
      existingPackage.limits = {
        users: payload.limits?.users ?? null,
      };
      existingPackage.features = payload.features ?? [];
      existingPackage.isActive = payload.isActive ?? true;
      existingPackage.isDefault = payload.isDefault ?? false;
      existingPackage.updatedBy = payload.updatedBy as any;

      await existingPackage.save();

      await deactivateStripeCatalog(
        previousStripeProductId,
        previousStripePriceId,
        previousStripePaymentLinkId
      );

      return { status: 'ok' as const, package: existingPackage };
    } catch (dbError) {
      await rollbackStripeCatalog(
        stripe.stripeProductId,
        stripe.stripePriceId,
        stripe.stripePaymentLinkId
      );
      throw dbError;
    }
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

export const deactivateBillingPackage = async (packageId: string, updatedBy: string) => {
  const packageDoc = await BillingPackage.findById(packageId);
  if (!packageDoc) {
    return { status: 'package_not_found' as const };
  }

  try {
    await deactivateStripePaymentLink(packageDoc.stripePaymentLinkId);
  } catch (error) {
    if (error instanceof StripeIntegrationError) {
      if (error.status === 'missing_secret_key') {
        return { status: 'stripe_not_configured' as const, message: error.message };
      }
      return { status: 'stripe_error' as const, message: error.message };
    }
    throw error;
  }

  packageDoc.isActive = false;
  packageDoc.updatedBy = updatedBy as any;
  await packageDoc.save();

  return { status: 'ok' as const, package: packageDoc };
};

export const deleteBillingPackage = async (packageId: string) => {
  const packageDoc = await BillingPackage.findById(packageId);
  if (!packageDoc) {
    return { status: 'package_not_found' as const };
  }

  try {
    await deactivateStripeCatalog(
      packageDoc.stripeProductId,
      packageDoc.price?.stripePriceId,
      packageDoc.stripePaymentLinkId
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

  await BillingPackage.deleteOne({ _id: packageId });
  return { status: 'ok' as const, package: packageDoc };
};

export const listPublicBillingPackages = async (filters?: {
  planType?: 'trial' | 'paid' | null;
  billingCycle?: 'monthly' | 'yearly' | null;
}) => {
  const query: Record<string, any> = { isActive: true };
  if (filters?.billingCycle) {
    query.billingCycle = filters.billingCycle;
  }
  if (filters?.planType === 'trial') {
    query.hasTrial = true;
  }

  const packages = await BillingPackage.find(query)
    .sort({ isDefault: -1, createdAt: 1 })
    .select({
      _id: 1,
      code: 1,
      name: 1,
      description: 1,
      hasTrial: 1,
      trialPeriodDays: 1,
      billingCycle: 1,
      price: 1,
      limits: 1,
      features: 1,
      isDefault: 1,
      buyLinkUrl: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .lean();

  return { packages };
};

type CreateCheckoutSessionInput = {
  packageId: string;
  userId: string;
  userEmail?: string | null;
};

const getOrCreateStripeCustomerIdForUser = async (userId: string, userEmail?: string | null) => {
  const existingSubscription = await BillingSubscription.findOne({
    userId,
    stripeCustomerId: { $exists: true, $ne: null },
  })
    .sort({ updatedAt: -1 })
    .select('stripeCustomerId');

  const existingCustomerId = String(existingSubscription?.stripeCustomerId || '').trim();
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const userProfile = await User.findById(userId).select(
    'email fullName companyName role teamId'
  );
  const email = userEmail ?? userProfile?.email ?? null;
  const customer = await createStripeCustomer({
    userId,
    email,
    fullName: userProfile?.fullName ?? null,
    companyName: userProfile?.companyName ?? null,
    role: userProfile?.role ?? null,
    teamId:
      userProfile?.teamId === null || userProfile?.teamId === undefined
        ? null
        : String(userProfile.teamId),
  });

  const customerId = String(customer.id || '').trim();
  if (!customerId) {
    throw new StripeIntegrationError('stripe_api_error', 'Stripe customer creation failed.');
  }

  return customerId;
};

export const createCheckoutSessionForPackage = async (payload: CreateCheckoutSessionInput) => {
  const packageDoc = await BillingPackage.findById(payload.packageId).select({
    _id: 1,
    code: 1,
    billingCycle: 1,
    hasTrial: 1,
    trialPeriodDays: 1,
    isActive: 1,
    price: 1,
  });

  if (!packageDoc) {
    return { status: 'package_not_found' as const };
  }

  if (!packageDoc.isActive) {
    return { status: 'package_inactive' as const };
  }

  if (!packageDoc.price?.stripePriceId) {
    return { status: 'package_price_missing' as const };
  }

  try {
    const customerId = await getOrCreateStripeCustomerIdForUser(payload.userId, payload.userEmail);
    const userProfile = await User.findById(payload.userId).select('fullName companyName role teamId email');
    const session = await createStripeCheckoutSession({
      stripePriceId: packageDoc.price.stripePriceId,
      packageId: String(packageDoc._id),
      packageCode: packageDoc.code,
      billingCycle: packageDoc.billingCycle,
      currency: packageDoc.price.currency,
      amount: packageDoc.price.amount,
      hasTrial: packageDoc.hasTrial,
      trialPeriodDays: packageDoc.trialPeriodDays,
      userId: payload.userId,
      userEmail: payload.userEmail ?? userProfile?.email ?? null,
      userFullName: userProfile?.fullName ?? null,
      userCompanyName: userProfile?.companyName ?? null,
      userRole: userProfile?.role ?? null,
      userTeamId:
        userProfile?.teamId === null || userProfile?.teamId === undefined
          ? null
          : String(userProfile.teamId),
      customerId,
    });

    return {
      status: 'ok' as const,
      checkout: {
        sessionId: session.id,
        checkoutUrl: session.url,
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

export const getStripeCheckoutSessionSummary = async (sessionId: string) => {
  try {
    const session = await retrieveStripeCheckoutSession(sessionId);

    const firstLineItem = Array.isArray(session.line_items?.data)
      ? session.line_items.data[0]
      : null;
    const price = firstLineItem?.price ?? null;
    const product = price?.product ?? null;
    let subscription =
      typeof session.subscription === 'object' && session.subscription
        ? session.subscription
        : null;
    const fallbackSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : typeof session.subscription?.id === 'string'
          ? session.subscription.id
          : null;
    if (
      (!subscription || subscription.current_period_end == null || subscription.current_period_start == null) &&
      fallbackSubscriptionId
    ) {
      try {
        const hydrated = await retrieveStripeSubscription(fallbackSubscriptionId);
        if (hydrated && typeof hydrated === 'object') {
          subscription = hydrated;
        }
      } catch {
        // Keep session-level subscription if direct hydration fails.
      }
    }
    const latestInvoice =
      typeof subscription?.latest_invoice === 'object' && subscription.latest_invoice
        ? subscription.latest_invoice
        : null;
    const sessionPaymentIntent =
      typeof session.payment_intent === 'object' && session.payment_intent
        ? session.payment_intent
        : null;
    const invoicePaymentIntent =
      typeof latestInvoice?.payment_intent === 'object' && latestInvoice.payment_intent
        ? latestInvoice.payment_intent
        : null;

    const getPaymentMethodObject = () => {
      const fromSubscriptionDefault =
        typeof subscription?.default_payment_method === 'object' && subscription.default_payment_method
          ? subscription.default_payment_method
          : null;
      if (fromSubscriptionDefault) return fromSubscriptionDefault;

      const fromInvoicePaymentIntent =
        typeof invoicePaymentIntent?.payment_method === 'object' && invoicePaymentIntent.payment_method
          ? invoicePaymentIntent.payment_method
          : null;
      if (fromInvoicePaymentIntent) return fromInvoicePaymentIntent;

      const fromSessionPaymentIntent =
        typeof sessionPaymentIntent?.payment_method === 'object' && sessionPaymentIntent.payment_method
          ? sessionPaymentIntent.payment_method
          : null;
      if (fromSessionPaymentIntent) return fromSessionPaymentIntent;

      return null;
    };

    const paymentMethod = getPaymentMethodObject();
    const card = paymentMethod?.card
      ? {
          paymentMethodId: typeof paymentMethod.id === 'string' ? paymentMethod.id : null,
          brand: paymentMethod.card?.brand ?? null,
          last4: paymentMethod.card?.last4 ?? null,
          expMonth: paymentMethod.card?.exp_month ?? null,
          expYear: paymentMethod.card?.exp_year ?? null,
        }
      : null;

    const toDateOrNull = (unixSeconds?: number | string | null) => {
      if (typeof unixSeconds === 'number') return new Date(unixSeconds * 1000);
      if (typeof unixSeconds === 'string' && /^\d+$/.test(unixSeconds)) {
        return new Date(Number(unixSeconds) * 1000);
      }
      return null;
    };

    const subscriptionFirstItem = Array.isArray(subscription?.items?.data)
      ? subscription.items.data[0]
      : null;
    const invoiceFirstLine = Array.isArray(latestInvoice?.lines?.data)
      ? latestInvoice.lines.data[0]
      : null;

    const resolvedPeriodStartRaw =
      subscription?.current_period_start ??
      subscriptionFirstItem?.current_period_start ??
      invoiceFirstLine?.period?.start ??
      null;
    const resolvedPeriodEndRaw =
      subscription?.current_period_end ??
      subscriptionFirstItem?.current_period_end ??
      invoiceFirstLine?.period?.end ??
      null;

    return {
      status: 'ok' as const,
      session: {
        id: String(session.id),
        status: session.status ?? null,
        paymentStatus: session.payment_status ?? null,
        customerId:
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id ?? null,
        customerMetadata:
          session.customer && typeof session.customer === 'object'
            ? session.customer.metadata ?? {}
            : {},
        customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
        metadata: session.metadata ?? {},
        subscriptionId:
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id ?? null,
        subscriptionMetadata:
          subscription ? subscription.metadata ?? {} : {},
        subscriptionStatus: subscription?.status ?? null,
        subscriptionCurrentPeriodStart: toDateOrNull(resolvedPeriodStartRaw),
        subscriptionCurrentPeriodEnd: toDateOrNull(resolvedPeriodEndRaw),
        subscriptionCancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end ?? false),
        subscriptionCanceledAt: toDateOrNull(subscription?.canceled_at),
        subscriptionTrialStart: toDateOrNull(subscription?.trial_start),
        subscriptionTrialEnd: toDateOrNull(subscription?.trial_end),
        latestInvoiceId:
          typeof latestInvoice?.id === 'string'
            ? latestInvoice.id
            : typeof subscription?.latest_invoice === 'string'
              ? subscription.latest_invoice
              : null,
        invoice: latestInvoice
          ? {
              id: typeof latestInvoice.id === 'string' ? latestInvoice.id : null,
              number: typeof latestInvoice.number === 'string' ? latestInvoice.number : null,
              status: typeof latestInvoice.status === 'string' ? latestInvoice.status : null,
              currency: typeof latestInvoice.currency === 'string' ? latestInvoice.currency : null,
              amountPaid:
                typeof latestInvoice.amount_paid === 'number'
                  ? latestInvoice.amount_paid
                  : typeof latestInvoice.total === 'number'
                    ? latestInvoice.total
                    : null,
              hostedInvoiceUrl:
                typeof latestInvoice.hosted_invoice_url === 'string'
                  ? latestInvoice.hosted_invoice_url
                  : null,
              invoicePdfUrl:
                typeof latestInvoice.invoice_pdf === 'string'
                  ? latestInvoice.invoice_pdf
                  : null,
              createdAt: toDateOrNull(latestInvoice.created),
            }
          : null,
        card,
        lineItem: price
          ? {
              currency: price.currency ?? null,
              unitAmount: price.unit_amount ?? null,
              priceId: typeof price.id === 'string' ? price.id : null,
              recurringInterval: price.recurring?.interval ?? null,
              productId: typeof product === 'string' ? product : product?.id ?? null,
              productName: typeof product === 'object' ? product?.name ?? null : null,
            }
          : null,
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
