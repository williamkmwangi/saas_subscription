import Stripe from 'stripe';
import { config } from '../config';
import logger from '../utils/logger';

// Initialize Stripe
const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
  typescript: true,
});

// Create a Stripe customer
export async function createCustomer(params: {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Customer> {
  try {
    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: params.metadata,
    });
    
    logger.info('Stripe customer created', { customerId: customer.id });
    return customer;
  } catch (error) {
    logger.error('Failed to create Stripe customer:', error);
    throw error;
  }
}

// Create a checkout session
export async function createCheckoutSession(params: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}): Promise<Stripe.Checkout.Session> {
  try {
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: params.customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
      subscription_data: {
        metadata: params.metadata,
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    };
    
    // Add trial if specified
    if (params.trialDays && params.trialDays > 0) {
      sessionConfig.subscription_data!.trial_period_days = params.trialDays;
    }
    
    const session = await stripe.checkout.sessions.create(sessionConfig);
    
    logger.info('Checkout session created', { sessionId: session.id });
    return session;
  } catch (error) {
    logger.error('Failed to create checkout session:', error);
    throw error;
  }
}

// Create a billing portal session
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    
    logger.info('Billing portal session created', { sessionId: session.id });
    return session;
  } catch (error) {
    logger.error('Failed to create billing portal session:', error);
    throw error;
  }
}

// Cancel a subscription
export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean = true
): Promise<Stripe.Subscription> {
  try {
    let subscription: Stripe.Subscription;
    
    if (cancelAtPeriodEnd) {
      subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    } else {
      subscription = await stripe.subscriptions.cancel(subscriptionId);
    }
    
    logger.info('Subscription cancelled', { 
      subscriptionId, 
      cancelAtPeriodEnd,
      status: subscription.status 
    });
    
    return subscription;
  } catch (error) {
    logger.error('Failed to cancel subscription:', error);
    throw error;
  }
}

// Resume a subscription (uncancel)
export async function resumeSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
    
    logger.info('Subscription resumed', { subscriptionId });
    return subscription;
  } catch (error) {
    logger.error('Failed to resume subscription:', error);
    throw error;
  }
}

// Update subscription (upgrade/downgrade)
export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string,
  prorationBehavior: 'create_prorations' | 'none' | 'always_invoice' = 'create_prorations'
): Promise<Stripe.Subscription> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: prorationBehavior,
    });
    
    logger.info('Subscription updated', { 
      subscriptionId, 
      newPriceId,
      prorationBehavior 
    });
    
    return updatedSubscription;
  } catch (error) {
    logger.error('Failed to update subscription:', error);
    throw error;
  }
}

// Get subscription details
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    logger.error('Failed to get subscription:', error);
    throw error;
  }
}

// Get customer invoices
export async function getCustomerInvoices(
  customerId: string,
  limit: number = 10
): Promise<Stripe.ApiList<Stripe.Invoice>> {
  try {
    return await stripe.invoices.list({
      customer: customerId,
      limit,
    });
  } catch (error) {
    logger.error('Failed to get customer invoices:', error);
    throw error;
  }
}

// Get upcoming invoice
export async function getUpcomingInvoice(
  customerId: string,
  subscriptionId?: string
): Promise<Stripe.UpcomingInvoice | null> {
  try {
    const params: Stripe.InvoiceRetrieveUpcomingParams = {
      customer: customerId,
    };
    
    if (subscriptionId) {
      params.subscription = subscriptionId;
    }
    
    return await stripe.invoices.retrieveUpcoming(params);
  } catch (error) {
    // No upcoming invoice is not an error
    if ((error as Stripe.errors.StripeError).code === 'invoice_upcoming_none') {
      return null;
    }
    logger.error('Failed to get upcoming invoice:', error);
    throw error;
  }
}

// Construct webhook event
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      config.stripe.webhookSecret
    );
  } catch (error) {
    logger.error('Webhook signature verification failed:', error);
    throw error;
  }
}

export default stripe;
