import { Request, Response } from 'express';
import { verifyStripeWebhookEvent } from './stripe.service';
import { handleStripeWebhookEvent } from '../subscription/subscription.service';

export const stripeWebhookHandler = async (req: Request, res: Response) => {
  const signatureHeader = req.header('stripe-signature');
  const rawBody = req.body;

  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid webhook payload type. Raw request body is required.',
    });
  }

  let event: Record<string, any>;
  try {
    event = verifyStripeWebhookEvent(rawBody, signatureHeader);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Stripe webhook signature',
      details: (error as Error).message,
    });
  }

  try {
    const result = await handleStripeWebhookEvent(event);
    return res.status(200).json({
      success: true,
      received: true,
      eventId: String(event.id || ''),
      eventType: String(event.type || ''),
      status: result.status,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to process Stripe webhook event',
      details: (error as Error).message,
    });
  }
};
