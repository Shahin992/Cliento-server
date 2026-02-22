import { CreatePackageInput, UpdatePackageInput } from './package.interface';
import { BillingPackage } from './package.model';
import {
  createStripeCatalog,
  deactivateStripeCatalog,
  deactivateStripePaymentLink,
  retrieveStripeCheckoutSession,
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

export const listPublicBillingPackages = async () => {
  const packages = await BillingPackage.find({ isActive: true })
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

export const getStripeCheckoutSessionSummary = async (sessionId: string) => {
  try {
    const session = await retrieveStripeCheckoutSession(sessionId);

    const firstLineItem = Array.isArray(session.line_items?.data)
      ? session.line_items.data[0]
      : null;
    const price = firstLineItem?.price ?? null;
    const product = price?.product ?? null;

    return {
      status: 'ok' as const,
      session: {
        id: String(session.id),
        status: session.status ?? null,
        paymentStatus: session.payment_status ?? null,
        customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
        metadata: session.metadata ?? {},
        subscriptionId:
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id ?? null,
        subscriptionMetadata:
          typeof session.subscription === 'object' && session.subscription
            ? session.subscription.metadata ?? {}
            : {},
        lineItem: price
          ? {
              currency: price.currency ?? null,
              unitAmount: price.unit_amount ?? null,
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
