import { BillingCurrency, BillingCycle, IPackagePriceInput } from './package.interface';

type StripeInterval = 'month' | 'year';

type StripeCreateCatalogInput = {
  code: string;
  name: string;
  description?: string | null;
  hasTrial: boolean;
  trialPeriodDays: number;
  billingCycle: BillingCycle;
  price: IPackagePriceInput;
};

type StripeCreateCheckoutSessionInput = {
  stripePriceId: string;
  packageId: string;
  packageCode: string;
  billingCycle: BillingCycle;
  currency: BillingCurrency;
  amount: number;
  hasTrial: boolean;
  trialPeriodDays: number;
  userId: string;
  userEmail?: string | null;
  userFullName?: string | null;
  userCompanyName?: string | null;
  userRole?: string | null;
  userTeamId?: string | null;
  customerId?: string | null;
};

class StripeIntegrationError extends Error {
  status: 'missing_secret_key' | 'stripe_api_error';

  constructor(status: 'missing_secret_key' | 'stripe_api_error', message: string) {
    super(message);
    this.status = status;
  }
}

const getStripeConfig = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new StripeIntegrationError('missing_secret_key', 'Missing STRIPE_SECRET_KEY in environment.');
  }

  const baseUrl = process.env.STRIPE_API_BASE_URL || 'https://api.stripe.com';
  return { secretKey, baseUrl };
};

const getStripePaymentSuccessRedirectUrl = () => {
  const configured = process.env.STRIPE_PAYMENT_SUCCESS_REDIRECT_URL?.trim();
  if (!configured) return null;

  if (configured.includes('{CHECKOUT_SESSION_ID}')) return configured;

  const separator = configured.includes('?') ? '&' : '?';
  return `${configured}${separator}session_id={CHECKOUT_SESSION_ID}`;
};

const getStripePaymentCancelRedirectUrl = () => {
  const configured = process.env.STRIPE_PAYMENT_CANCEL_REDIRECT_URL?.trim();
  if (configured) return configured;

  const successUrl = process.env.STRIPE_PAYMENT_SUCCESS_REDIRECT_URL?.trim();
  return successUrl || 'http://localhost:5173/payment/cancel';
};

const convertAmountToMinorUnit = (amount: number, currency: BillingCurrency) => {
  const twoDecimalCurrencies = new Set<BillingCurrency>(['usd', 'eur', 'gbp', 'bdt']);
  if (!twoDecimalCurrencies.has(currency)) return Math.round(amount);
  return Math.round(amount * 100);
};

const postToStripe = async (path: string, body: URLSearchParams) => {
  const { secretKey, baseUrl } = getStripeConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const json = await response.json();
  if (!response.ok) {
    const message = json?.error?.message || 'Stripe API request failed.';
    throw new StripeIntegrationError('stripe_api_error', message);
  }

  return json as Record<string, any>;
};

const getFromStripe = async (path: string, query?: URLSearchParams) => {
  const { secretKey, baseUrl } = getStripeConfig();
  const suffix = query ? `?${query.toString()}` : '';

  const response = await fetch(`${baseUrl}${path}${suffix}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });

  const json = await response.json();
  if (!response.ok) {
    const message = json?.error?.message || 'Stripe API request failed.';
    throw new StripeIntegrationError('stripe_api_error', message);
  }

  return json as Record<string, any>;
};

const createStripeProduct = async (payload: StripeCreateCatalogInput) => {
  const body = new URLSearchParams();
  body.append('name', payload.name);
  if (payload.description) body.append('description', payload.description);
  body.append('metadata[package_code]', payload.code.toLowerCase());
  body.append('metadata[has_trial]', String(payload.hasTrial));
  body.append('metadata[trial_days]', String(payload.trialPeriodDays));

  const product = await postToStripe('/v1/products', body);
  return String(product.id);
};

const createStripeRecurringPrice = async (
  stripeProductId: string,
  amount: number,
  currency: BillingCurrency,
  interval: StripeInterval
) => {
  const body = new URLSearchParams();
  body.append('product', stripeProductId);
  body.append('currency', currency);
  body.append('unit_amount', String(convertAmountToMinorUnit(amount, currency)));
  body.append('recurring[interval]', interval);
  body.append('active', 'true');
  body.append('metadata[billing_interval]', interval);

  const price = await postToStripe('/v1/prices', body);
  return String(price.id);
};

const deactivateStripePrice = async (priceId: string) => {
  const body = new URLSearchParams();
  body.append('active', 'false');
  await postToStripe(`/v1/prices/${priceId}`, body);
};

const deactivateStripeProduct = async (productId: string) => {
  const body = new URLSearchParams();
  body.append('active', 'false');
  await postToStripe(`/v1/products/${productId}`, body);
};

const createStripePaymentLink = async (
  stripePriceId: string,
  payload: StripeCreateCatalogInput
) => {
  const body = new URLSearchParams();
  body.append('line_items[0][price]', stripePriceId);
  body.append('line_items[0][quantity]', '1');
  body.append('metadata[package_code]', payload.code.toLowerCase());
  body.append('metadata[billing_cycle]', payload.billingCycle);
  body.append('metadata[currency]', payload.price.currency);
  body.append('metadata[amount]', String(payload.price.amount));
  body.append('subscription_data[metadata][package_code]', payload.code.toLowerCase());
  body.append('subscription_data[metadata][billing_cycle]', payload.billingCycle);

  if (payload.hasTrial && payload.trialPeriodDays > 0) {
    body.append('subscription_data[trial_period_days]', String(payload.trialPeriodDays));
  }

  const successRedirectUrl = getStripePaymentSuccessRedirectUrl();
  if (successRedirectUrl) {
    body.append('after_completion[type]', 'redirect');
    body.append('after_completion[redirect][url]', successRedirectUrl);
  }

  const paymentLink = await postToStripe('/v1/payment_links', body);
  return {
    id: String(paymentLink.id),
    url: String(paymentLink.url),
  };
};

export const createStripeCheckoutSession = async (payload: StripeCreateCheckoutSessionInput) => {
  const body = new URLSearchParams();
  body.append('mode', 'subscription');
  body.append('line_items[0][price]', payload.stripePriceId);
  body.append('line_items[0][quantity]', '1');
  body.append('metadata[package_id]', payload.packageId);
  body.append('metadata[package_code]', payload.packageCode.toLowerCase());
  body.append('metadata[user_id]', payload.userId);
  if (payload.userEmail) body.append('metadata[user_email]', payload.userEmail);
  if (payload.userFullName) body.append('metadata[user_full_name]', payload.userFullName);
  if (payload.userCompanyName) body.append('metadata[user_company_name]', payload.userCompanyName);
  if (payload.userRole) body.append('metadata[user_role]', payload.userRole);
  if (payload.userTeamId) body.append('metadata[user_team_id]', payload.userTeamId);
  body.append('metadata[billing_cycle]', payload.billingCycle);
  body.append('metadata[currency]', payload.currency);
  body.append('metadata[amount]', String(payload.amount));
  body.append('subscription_data[metadata][package_id]', payload.packageId);
  body.append('subscription_data[metadata][package_code]', payload.packageCode.toLowerCase());
  body.append('subscription_data[metadata][user_id]', payload.userId);
  if (payload.userEmail) body.append('subscription_data[metadata][user_email]', payload.userEmail);
  if (payload.userFullName) body.append('subscription_data[metadata][user_full_name]', payload.userFullName);
  if (payload.userCompanyName) {
    body.append('subscription_data[metadata][user_company_name]', payload.userCompanyName);
  }
  if (payload.userRole) body.append('subscription_data[metadata][user_role]', payload.userRole);
  if (payload.userTeamId) body.append('subscription_data[metadata][user_team_id]', payload.userTeamId);
  body.append('subscription_data[metadata][billing_cycle]', payload.billingCycle);
  body.append('subscription_data[metadata][currency]', payload.currency);
  body.append('subscription_data[metadata][amount]', String(payload.amount));
  body.append('allow_promotion_codes', 'true');

  if (payload.customerId) {
    body.append('customer', payload.customerId);
  } else if (payload.userEmail) {
    body.append('customer_email', payload.userEmail);
  }

  if (payload.hasTrial && payload.trialPeriodDays > 0) {
    body.append('subscription_data[trial_period_days]', String(payload.trialPeriodDays));
  }

  const successRedirectUrl = getStripePaymentSuccessRedirectUrl();
  if (successRedirectUrl) {
    body.append('success_url', successRedirectUrl);
  } else {
    body.append('success_url', 'http://localhost:5173/payment/success?session_id={CHECKOUT_SESSION_ID}');
  }

  body.append('cancel_url', getStripePaymentCancelRedirectUrl());

  const session = await postToStripe('/v1/checkout/sessions', body);
  return {
    id: String(session.id),
    url: String(session.url),
  };
};

export const deactivateStripePaymentLink = async (paymentLinkId: string) => {
  const body = new URLSearchParams();
  body.append('active', 'false');
  await postToStripe(`/v1/payment_links/${paymentLinkId}`, body);
};

export const createStripeCatalog = async (payload: StripeCreateCatalogInput) => {
  const stripeProductId = await createStripeProduct(payload);
  let stripePriceId: string | null = null;
  let stripePaymentLinkId: string | null = null;
  let buyLinkUrl: string | null = null;

  try {
    stripePriceId = await createStripeRecurringPrice(
      stripeProductId,
      payload.price.amount,
      payload.price.currency,
      payload.billingCycle === 'monthly' ? 'month' : 'year'
    );

    const paymentLink = await createStripePaymentLink(stripePriceId, payload);
    stripePaymentLinkId = paymentLink.id;
    buyLinkUrl = paymentLink.url;

    return { stripeProductId, stripePriceId, stripePaymentLinkId, buyLinkUrl };
  } catch (error) {
    const rollbackJobs: Promise<unknown>[] = [];
    if (stripePaymentLinkId) rollbackJobs.push(deactivateStripePaymentLink(stripePaymentLinkId));
    if (stripePriceId) rollbackJobs.push(deactivateStripePrice(stripePriceId));
    rollbackJobs.push(deactivateStripeProduct(stripeProductId));
    await Promise.allSettled(rollbackJobs);
    throw error;
  }
};

export const rollbackStripeCatalog = async (
  stripeProductId: string,
  stripePriceId?: string | null,
  stripePaymentLinkId?: string | null
) => {
  const rollbackJobs: Promise<unknown>[] = [deactivateStripeProduct(stripeProductId)];
  if (stripePaymentLinkId) rollbackJobs.push(deactivateStripePaymentLink(stripePaymentLinkId));
  if (stripePriceId) rollbackJobs.push(deactivateStripePrice(stripePriceId));
  await Promise.allSettled(rollbackJobs);
};

export const deactivateStripeCatalog = rollbackStripeCatalog;

export const retrieveStripeCheckoutSession = async (sessionId: string) => {
  const query = new URLSearchParams();
  query.append('expand[]', 'subscription');
  query.append('expand[]', 'subscription.items');
  query.append('expand[]', 'subscription.items.data');
  query.append('expand[]', 'subscription.default_payment_method');
  query.append('expand[]', 'subscription.latest_invoice');
  query.append('expand[]', 'subscription.latest_invoice.lines');
  query.append('expand[]', 'subscription.latest_invoice.lines.data');
  query.append('expand[]', 'subscription.latest_invoice.payment_intent');
  query.append('expand[]', 'subscription.latest_invoice.payment_intent.payment_method');
  query.append('expand[]', 'payment_intent');
  query.append('expand[]', 'payment_intent.payment_method');
  query.append('expand[]', 'line_items.data.price.product');

  return getFromStripe(`/v1/checkout/sessions/${sessionId}`, query);
};

export const retrieveStripeSubscription = async (subscriptionId: string) => {
  const query = new URLSearchParams();
  query.append('expand[]', 'items');
  query.append('expand[]', 'items.data');
  query.append('expand[]', 'customer');
  query.append('expand[]', 'default_payment_method');
  query.append('expand[]', 'latest_invoice');
  query.append('expand[]', 'latest_invoice.lines');
  query.append('expand[]', 'latest_invoice.lines.data');
  query.append('expand[]', 'latest_invoice.payment_intent');
  query.append('expand[]', 'latest_invoice.payment_intent.payment_method');

  return getFromStripe(`/v1/subscriptions/${subscriptionId}`, query);
};

export const createStripeCustomer = async (payload: {
  email?: string | null;
  userId: string;
  fullName?: string | null;
  companyName?: string | null;
  role?: string | null;
  teamId?: string | null;
}) => {
  const body = new URLSearchParams();
  body.append('metadata[user_id]', payload.userId);
  if (payload.fullName) body.append('metadata[full_name]', payload.fullName);
  if (payload.companyName) body.append('metadata[company_name]', payload.companyName);
  if (payload.role) body.append('metadata[role]', payload.role);
  if (payload.teamId) body.append('metadata[team_id]', payload.teamId);
  if (payload.email) {
    body.append('email', payload.email);
    body.append('metadata[email]', payload.email);
  }

  return postToStripe('/v1/customers', body);
};

export const createStripeSetupIntent = async (customerId: string) => {
  const body = new URLSearchParams();
  body.append('customer', customerId);
  body.append('usage', 'off_session');
  body.append('payment_method_types[]', 'card');

  return postToStripe('/v1/setup_intents', body);
};

export const attachStripePaymentMethodToCustomer = async (
  paymentMethodId: string,
  customerId: string
) => {
  const body = new URLSearchParams();
  body.append('customer', customerId);
  return postToStripe(`/v1/payment_methods/${paymentMethodId}/attach`, body);
};

export const retrieveStripePaymentMethod = async (paymentMethodId: string) => {
  return getFromStripe(`/v1/payment_methods/${paymentMethodId}`);
};

export const setStripeCustomerDefaultPaymentMethod = async (
  customerId: string,
  paymentMethodId: string
) => {
  const body = new URLSearchParams();
  body.append('invoice_settings[default_payment_method]', paymentMethodId);
  return postToStripe(`/v1/customers/${customerId}`, body);
};

export const setStripeSubscriptionDefaultPaymentMethod = async (
  subscriptionId: string,
  paymentMethodId: string
) => {
  const body = new URLSearchParams();
  body.append('default_payment_method', paymentMethodId);
  return postToStripe(`/v1/subscriptions/${subscriptionId}`, body);
};

export { StripeIntegrationError };
