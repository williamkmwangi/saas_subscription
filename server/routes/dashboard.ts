import { Router } from 'express';
import { query, queryOne } from '../db/pool';
import { authenticate } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

// Get user dashboard data
router.get('/', authenticate, async (req, res) => {
  try {
    // Get user with subscription
    const user = await queryOne(
      `SELECT u.id, u.email, u.first_name, u.last_name, 
              u.email_verified, u.role, u.created_at, u.updated_at,
              s.id as sub_id, s.status as sub_status, s.current_period_end,
              s.cancel_at_period_end, s.trial_end,
              p.id as plan_id, p.name as plan_name, p.price as plan_price,
              p.currency as plan_currency, p.interval as plan_interval,
              p.features as plan_features
       FROM users u
       LEFT JOIN subscriptions s ON u.id = s.user_id
       LEFT JOIN plans p ON s.plan_id = p.id
       WHERE u.id = $1
       ORDER BY s.created_at DESC
       LIMIT 1`,
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
    
    // Get usage data
    const usage = await query(
      `SELECT metric, SUM(value) as total
       FROM usage 
       WHERE user_id = $1 
       AND recorded_at > NOW() - INTERVAL '30 days'
       GROUP BY metric`,
      [req.user!.id]
    );
    
    // Get recent invoices
    const invoices = await query(
      `SELECT id, amount, currency, status, 
              hosted_invoice_url, created_at, period_start, period_end
       FROM invoices 
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [req.user!.id]
    );
    
    // Calculate usage limits based on plan
    const planLimits: Record<string, Record<string, number>> = {
      'Free': { api_calls: 1000, storage_mb: 1024, projects: 3 },
      'Starter': { api_calls: 10000, storage_mb: 10240, projects: -1 },
      'Pro': { api_calls: 100000, storage_mb: 51200, projects: -1 },
      'Enterprise': { api_calls: -1, storage_mb: -1, projects: -1 },
    };
    
    const limits = planLimits[user.plan_name] || planLimits['Free'];
    
    // Format usage data
    const usageMetrics = [
      {
        metric: 'API Calls',
        key: 'api_calls',
        current: parseInt(usage.find(u => u.metric === 'api_calls')?.total || '0'),
        limit: limits.api_calls,
      },
      {
        metric: 'Storage',
        key: 'storage_mb',
        current: parseInt(usage.find(u => u.metric === 'storage_mb')?.total || '0'),
        limit: limits.storage_mb,
      },
      {
        metric: 'Projects',
        key: 'projects',
        current: parseInt(usage.find(u => u.metric === 'projects')?.total || '0'),
        limit: limits.projects,
      },
    ].map(u => ({
      ...u,
      percentage: u.limit > 0 ? Math.min(100, Math.round((u.current / u.limit) * 100)) : 0,
      unlimited: u.limit < 0,
    }));
    
    // Format subscription data
    const subscription = user.sub_id ? {
      id: user.sub_id,
      status: user.sub_status,
      currentPeriodEnd: user.current_period_end,
      cancelAtPeriodEnd: user.cancel_at_period_end,
      trialEnd: user.trial_end,
      plan: {
        id: user.plan_id,
        name: user.plan_name,
        price: user.plan_price,
        currency: user.plan_currency,
        interval: user.plan_interval,
        features: typeof user.plan_features === 'string' 
          ? JSON.parse(user.plan_features) 
          : user.plan_features,
      },
    } : null;
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          emailVerified: user.email_verified,
          role: user.role,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
        subscription,
        usage: usageMetrics,
        recentInvoices: invoices,
      },
    });
  } catch (error) {
    logger.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch dashboard data',
      },
    });
  }
});

// Get usage history
router.get('/usage', authenticate, async (req, res) => {
  try {
    const { metric, days = '30' } = req.query;
    
    let query_text = `
      SELECT DATE(recorded_at) as date, SUM(value) as total
      FROM usage 
      WHERE user_id = $1 
      AND recorded_at > NOW() - INTERVAL '${parseInt(days as string)} days'
    `;
    
    const params: (string | number)[] = [req.user!.id];
    
    if (metric) {
      query_text += ` AND metric = $2`;
      params.push(metric as string);
    }
    
    query_text += ` GROUP BY DATE(recorded_at) ORDER BY date DESC`;
    
    const usage = await query(query_text, params);
    
    res.json({
      success: true,
      data: usage,
    });
  } catch (error) {
    logger.error('Usage history error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch usage history',
      },
    });
  }
});

export default router;
