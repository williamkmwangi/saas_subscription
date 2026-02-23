import { Router } from 'express';
import { query } from '../db/pool';
import { authenticate, optionalAuth } from '../middleware/auth';
import logger from '../utils/logger';
import type { Plan } from '../../shared/types';

const router = Router();

// Get all public plans
router.get('/', optionalAuth, async (req, res) => {
  try {
    const plans = await query<Plan>(
      `SELECT id, name, description, price, currency, interval, 
              features, is_active, trial_days, sort_order, created_at, updated_at
       FROM plans 
       WHERE is_public = TRUE AND is_active = TRUE
       ORDER BY sort_order ASC, price ASC`
    );
    
    // Format plans for response
    const formattedPlans = plans.map(plan => ({
      ...plan,
      features: typeof plan.features === 'string' 
        ? JSON.parse(plan.features) 
        : plan.features,
    }));
    
    res.json({
      success: true,
      data: formattedPlans,
    });
  } catch (error) {
    logger.error('Get plans error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch plans',
      },
    });
  }
});

// Get single plan
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const plan = await query(
      `SELECT id, name, description, price, currency, interval, 
              features, is_active, trial_days, sort_order, created_at, updated_at
       FROM plans 
       WHERE id = $1 AND is_public = TRUE AND is_active = TRUE`,
      [id]
    );
    
    if (!plan || plan.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAN_NOT_FOUND',
          message: 'Plan not found',
        },
      });
    }
    
    const formattedPlan = {
      ...plan[0],
      features: typeof plan[0].features === 'string' 
        ? JSON.parse(plan[0].features) 
        : plan[0].features,
    };
    
    res.json({
      success: true,
      data: formattedPlan,
    });
  } catch (error) {
    logger.error('Get plan error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch plan',
      },
    });
  }
});

// Get current user's plan (authenticated)
router.get('/current/mine', authenticate, async (req, res) => {
  try {
    const subscription = await query(
      `SELECT s.*, p.name as plan_name, p.description as plan_description,
              p.price, p.currency, p.interval, p.features, p.trial_days
       FROM subscriptions s
       JOIN plans p ON s.plan_id = p.id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [req.user!.id]
    );
    
    if (!subscription || subscription.length === 0) {
      return res.json({
        success: true,
        data: null,
      });
    }
    
    const formattedSubscription = {
      ...subscription[0],
      features: typeof subscription[0].features === 'string' 
        ? JSON.parse(subscription[0].features) 
        : subscription[0].features,
    };
    
    res.json({
      success: true,
      data: formattedSubscription,
    });
  } catch (error) {
    logger.error('Get current plan error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch current plan',
      },
    });
  }
});

export default router;
