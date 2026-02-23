import { Router, raw } from 'express';
import { query, queryOne } from '../db/pool';
import { constructWebhookEvent } from '../services/stripe';
import { webhookLimiter } from '../middleware/security';
import logger from '../utils/logger';
import type Stripe from 'stripe';

const router = Router();

// Raw body parser for Stripe webhooks
router.use(raw({ type: 'application/json' }));

// Stripe webhook endpoint
router.post('/stripe', webhookLimiter, async (req, res) => {
  const signature = req.headers['stripe-signature'] as string;
  
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }
  
  let event: Stripe.Event;
  
  try {
    event = constructWebhookEvent(req.body, signature);
  } catch (error) {
    logger.error('Webhook signature verification failed:', error);
    return res.status(400).json({ error: 'Invalid signature' });
  }
  
  // Check for duplicate events
  const existingEvent = await queryOne(
    'SELECT id FROM webhook_events WHERE stripe_event_id = $1',
    [event.id]
  );
  
  if (existingEvent) {
    logger.info('Duplicate webhook event received', { eventId: event.id });
    return res.json({ received: true });
  }
  
  // Store event
  await query(
    `INSERT INTO webhook_events (stripe_event_id, event_type, payload)
     VALUES ($1, $2, $3)`,
    [event.id, event.type, JSON.stringify(event)]
  );
  
  logger.info('Processing webhook event', { 
    eventId: event.id, 
    type: event.type 
  });
  
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
        
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
        
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
        
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
        
      case 'invoice.finalized':
        await handleInvoiceFinalized(event.data.object as Stripe.Invoice);
        break;
        
      default:
        logger.info('Unhandled webhook event type', { type: event.type });
    }
    
    // Mark event as processed
    await query(
      'UPDATE webhook_events SET processed_at = NOW() WHERE stripe_event_id = $1',
      [event.id]
    );
    
    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing error:', error);
    
    // Update event with error
    await query(
      'UPDATE webhook_events SET error_message = $1, retry_count = retry_count + 1 WHERE stripe_event_id = $2',
      [(error as Error).message, event.id]
    );
    
    // Return 200 to prevent Stripe retries for unrecoverable errors
    // In production, you might want to return 500 for retryable errors
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle checkout session completed
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') return;
  
  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;
  
  if (!userId || !planId) {
    throw new Error('Missing metadata in checkout session');
  }
  
  const subscription = await queryOne(
    'SELECT id FROM subscriptions WHERE user_id = $1',
    [userId]
  );
  
  if (subscription) {
    // Update existing subscription
    await query(
      `UPDATE subscriptions 
       SET stripe_subscription_id = $1,
           status = $2,
           current_period_start = to_timestamp($3),
           current_period_end = to_timestamp($4),
           trial_start = CASE WHEN $5 > 0 THEN to_timestamp($5) ELSE NULL END,
           trial_end = CASE WHEN $6 > 0 THEN to_timestamp($6) ELSE NULL END,
           updated_at = NOW()
       WHERE user_id = $7`,
      [
        session.subscription,
        'active',
        session.subscription_details?.current_period_start || Date.now() / 1000,
        session.subscription_details?.current_period_end || Date.now() / 1000,
        session.subscription_details?.trial_start || 0,
        session.subscription_details?.trial_end || 0,
        userId,
      ]
    );
  } else {
    // Create new subscription
    await query(
      `INSERT INTO subscriptions (
        user_id, plan_id, stripe_customer_id, stripe_subscription_id,
        status, current_period_start, current_period_end,
        trial_start, trial_end
      ) VALUES ($1, $2, $3, $4, $5, to_timestamp($6), to_timestamp($7), 
                CASE WHEN $8 > 0 THEN to_timestamp($8) ELSE NULL END,
                CASE WHEN $9 > 0 THEN to_timestamp($9) ELSE NULL END)`,
      [
        userId,
        planId,
        session.customer,
        session.subscription,
        'active',
        session.subscription_details?.current_period_start || Date.now() / 1000,
        session.subscription_details?.current_period_end || Date.now() / 1000,
        session.subscription_details?.trial_start || 0,
        session.subscription_details?.trial_end || 0,
      ]
    );
  }
  
  logger.info('Checkout session completed', { userId, planId });
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const dbSubscription = await queryOne(
    'SELECT id FROM subscriptions WHERE stripe_subscription_id = $1',
    [subscription.id]
  );
  
  if (!dbSubscription) {
    logger.warn('Subscription not found in database', { stripeSubscriptionId: subscription.id });
    return;
  }
  
  await query(
    `UPDATE subscriptions 
     SET status = $1,
         current_period_start = to_timestamp($2),
         current_period_end = to_timestamp($3),
         cancel_at_period_end = $4,
         canceled_at = CASE WHEN $5 IS NOT NULL THEN to_timestamp($5) ELSE canceled_at END,
         trial_start = CASE WHEN $6 > 0 THEN to_timestamp($6) ELSE NULL END,
         trial_end = CASE WHEN $7 > 0 THEN to_timestamp($7) ELSE NULL END,
         updated_at = NOW()
     WHERE stripe_subscription_id = $8`,
    [
      subscription.status,
      subscription.current_period_start,
      subscription.current_period_end,
      subscription.cancel_at_period_end,
      subscription.canceled_at,
      subscription.trial_start || 0,
      subscription.trial_end || 0,
      subscription.id,
    ]
  );
  
  logger.info('Subscription updated', { 
    subscriptionId: subscription.id, 
    status: subscription.status 
  });
}

// Handle subscription deleted
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await query(
    `UPDATE subscriptions 
     SET status = 'canceled',
         canceled_at = NOW(),
         updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );
  
  logger.info('Subscription deleted', { subscriptionId: subscription.id });
}

// Handle invoice payment succeeded
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  if (!invoice.customer) return;
  
  const user = await queryOne(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [invoice.customer]
  );
  
  if (!user) {
    logger.warn('User not found for invoice', { customerId: invoice.customer });
    return;
  }
  
  // Get subscription ID if available
  let subscriptionId = null;
  if (invoice.subscription) {
    const subscription = await queryOne(
      'SELECT id FROM subscriptions WHERE stripe_subscription_id = $1',
      [invoice.subscription]
    );
    if (subscription) {
      subscriptionId = subscription.id;
    }
  }
  
  // Store invoice
  await query(
    `INSERT INTO invoices (
      user_id, subscription_id, stripe_invoice_id, stripe_charge_id,
      amount, currency, status, invoice_pdf, hosted_invoice_url,
      period_start, period_end, paid_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10), to_timestamp($11), NOW())
    ON CONFLICT (stripe_invoice_id) DO UPDATE SET
      status = EXCLUDED.status,
      paid_at = NOW()`,
    [
      user.id,
      subscriptionId,
      invoice.id,
      invoice.charge,
      invoice.amount_due,
      invoice.currency.toUpperCase(),
      invoice.status,
      invoice.invoice_pdf,
      invoice.hosted_invoice_url,
      invoice.period_start,
      invoice.period_end,
    ]
  );
  
  logger.info('Invoice payment succeeded', { 
    invoiceId: invoice.id, 
    userId: user.id 
  });
}

// Handle invoice payment failed
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.customer) return;
  
  const user = await queryOne(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [invoice.customer]
  );
  
  if (!user) return;
  
  // Update invoice status
  await query(
    `INSERT INTO invoices (
      user_id, subscription_id, stripe_invoice_id, stripe_charge_id,
      amount, currency, status, period_start, period_end
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8), to_timestamp($9))
    ON CONFLICT (stripe_invoice_id) DO UPDATE SET
      status = EXCLUDED.status`,
    [
      user.id,
      null,
      invoice.id,
      invoice.charge,
      invoice.amount_due,
      invoice.currency.toUpperCase(),
      'open',
      invoice.period_start,
      invoice.period_end,
    ]
  );
  
  logger.warn('Invoice payment failed', { 
    invoiceId: invoice.id, 
    userId: user.id 
  });
}

// Handle invoice finalized
async function handleInvoiceFinalized(invoice: Stripe.Invoice) {
  // Similar to payment succeeded but without paid_at
  if (!invoice.customer) return;
  
  const user = await queryOne(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [invoice.customer]
  );
  
  if (!user) return;
  
  await query(
    `INSERT INTO invoices (
      user_id, subscription_id, stripe_invoice_id, stripe_charge_id,
      amount, currency, status, invoice_pdf, hosted_invoice_url,
      period_start, period_end
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10), to_timestamp($11))
    ON CONFLICT (stripe_invoice_id) DO NOTHING`,
    [
      user.id,
      null,
      invoice.id,
      invoice.charge,
      invoice.amount_due,
      invoice.currency.toUpperCase(),
      invoice.status,
      invoice.invoice_pdf,
      invoice.hosted_invoice_url,
      invoice.period_start,
      invoice.period_end,
    ]
  );
}

export default router;
