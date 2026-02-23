import { Router } from 'express';
import { query, queryOne, withTransaction } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { createCheckoutValidation, handleValidationErrors } from '../middleware/validation';
import {
  createCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  cancelSubscription,
  resumeSubscription,
  getCustomerInvoices,
} from '../services/stripe';
import { config } from '../config';
import logger from '../utils/logger';

const router = Router();

// Create checkout session
router.post(
  '/checkout',
  authenticate,
  createCheckoutValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { planId, successUrl, cancelUrl } = req.body;
      
      // Get plan details
      const plan = await queryOne(
        `SELECT id, name, stripe_price_id, trial_days 
         FROM plans WHERE id = $1 AND is_active = TRUE`,
        [planId]
      );
      
      if (!plan) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PLAN_NOT_FOUND',
            message: 'Plan not found',
          },
        });
      }
      
      // Get user details
      const user = await queryOne(
        `SELECT email, first_name, last_name, stripe_customer_id 
         FROM users WHERE id = $1`,
        [req.user!.id]
      );
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }
      
      // Create or get Stripe customer
      let customerId = user.stripe_customer_id;
      
      if (!customerId) {
        const customer = await createCustomer({
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          metadata: {
            userId: req.user!.id,
          },
        });
        
        customerId = customer.id;
        
        // Save customer ID to user
        await query(
          'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
          [customerId, req.user!.id]
        );
      }
      
      // Create checkout session
      const session = await createCheckoutSession({
        customerId,
        priceId: plan.stripe_price_id,
        successUrl,
        cancelUrl,
        trialDays: config.features.enableTrialPeriods ? plan.trial_days : 0,
        metadata: {
          userId: req.user!.id,
          planId: plan.id,
        },
      });
      
      res.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url,
        },
      });
    } catch (error) {
      logger.error('Create checkout error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create checkout session',
        },
      });
    }
  }
);

// Get current subscription
router.get('/current', authenticate, async (req, res) => {
  try {
    const subscription = await queryOne(
      `SELECT s.*, p.name as plan_name, p.description as plan_description,
              p.price, p.currency, p.interval, p.features, p.trial_days
       FROM subscriptions s
       JOIN plans p ON s.plan_id = p.id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [req.user!.id]
    );
    
    if (!subscription) {
      return res.json({
        success: true,
        data: null,
      });
    }
    
    // Format features
    const formattedSubscription = {
      ...subscription,
      features: typeof subscription.features === 'string' 
        ? JSON.parse(subscription.features) 
        : subscription.features,
    };
    
    res.json({
      success: true,
      data: formattedSubscription,
    });
  } catch (error) {
    logger.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch subscription',
      },
    });
  }
});

// Create billing portal session
router.post('/billing-portal', authenticate, async (req, res) => {
  try {
    const { returnUrl } = req.body;
    
    // Get user's Stripe customer ID
    const user = await queryOne(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.user!.id]
    );
    
    if (!user?.stripe_customer_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_CUSTOMER',
          message: 'No billing information found',
        },
      });
    }
    
    const session = await createBillingPortalSession(
      user.stripe_customer_id,
      returnUrl || `${config.clientUrl}/dashboard/billing`
    );
    
    res.json({
      success: true,
      data: {
        url: session.url,
      },
    });
  } catch (error) {
    logger.error('Billing portal error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create billing portal session',
      },
    });
  }
});

// Cancel subscription
router.post('/cancel', authenticate, async (req, res) => {
  try {
    const { immediate } = req.body;
    
    const subscription = await queryOne(
      `SELECT s.*, u.stripe_customer_id
       FROM subscriptions s
       JOIN users u ON s.user_id = u.id
       WHERE s.user_id = $1 AND s.stripe_subscription_id IS NOT NULL
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [req.user!.id]
    );
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_NOT_FOUND',
          message: 'No active subscription found',
        },
      });
    }
    
    // Cancel in Stripe
    await cancelSubscription(subscription.stripe_subscription_id, !immediate);
    
    // Update local database
    await query(
      `UPDATE subscriptions 
       SET cancel_at_period_end = $1, 
           canceled_at = CASE WHEN $1 = FALSE THEN NOW() ELSE NULL END,
           status = CASE WHEN $1 = FALSE THEN 'canceled' ELSE status END
       WHERE id = $2`,
      [!immediate, subscription.id]
    );
    
    logger.info('Subscription cancelled', { 
      subscriptionId: subscription.id, 
      immediate,
      userId: req.user!.id 
    });
    
    res.json({
      success: true,
      message: immediate 
        ? 'Subscription cancelled immediately' 
        : 'Subscription will be cancelled at the end of the billing period',
    });
  } catch (error) {
    logger.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to cancel subscription',
      },
    });
  }
});

// Resume subscription (uncancel)
router.post('/resume', authenticate, async (req, res) => {
  try {
    const subscription = await queryOne(
      `SELECT s.*, u.stripe_customer_id
       FROM subscriptions s
       JOIN users u ON s.user_id = u.id
       WHERE s.user_id = $1 AND s.stripe_subscription_id IS NOT NULL
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [req.user!.id]
    );
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_NOT_FOUND',
          message: 'No active subscription found',
        },
      });
    }
    
    if (!subscription.cancel_at_period_end) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NOT_CANCELED',
          message: 'Subscription is not scheduled for cancellation',
        },
      });
    }
    
    // Resume in Stripe
    await resumeSubscription(subscription.stripe_subscription_id);
    
    // Update local database
    await query(
      'UPDATE subscriptions SET cancel_at_period_end = FALSE, canceled_at = NULL WHERE id = $1',
      [subscription.id]
    );
    
    logger.info('Subscription resumed', { 
      subscriptionId: subscription.id,
      userId: req.user!.id 
    });
    
    res.json({
      success: true,
      message: 'Subscription resumed successfully',
    });
  } catch (error) {
    logger.error('Resume subscription error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to resume subscription',
      },
    });
  }
});

// Get invoices
router.get('/invoices', authenticate, async (req, res) => {
  try {
    // Get user's Stripe customer ID
    const user = await queryOne(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.user!.id]
    );
    
    if (!user?.stripe_customer_id) {
      return res.json({
        success: true,
        data: [],
      });
    }
    
    // Get invoices from database (synced via webhooks)
    const invoices = await query(
      `SELECT id, stripe_invoice_id, amount, currency, status, 
              invoice_pdf, hosted_invoice_url, created_at, period_start, period_end
       FROM invoices 
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user!.id]
    );
    
    res.json({
      success: true,
      data: invoices,
    });
  } catch (error) {
    logger.error('Get invoices error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch invoices',
      },
    });
  }
});

export default router;
