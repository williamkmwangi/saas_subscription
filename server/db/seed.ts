import bcrypt from 'bcryptjs';
import pool, { query } from './pool';
import { config } from '../config';
import logger from '../utils/logger';

async function seed() {
  try {
    logger.info('Starting database seeding...');
    
    // Seed plans
    await seedPlans();
    
    // Seed demo users
    await seedDemoUsers();
    
    logger.info('Database seeding completed successfully');
  } catch (error) {
    logger.error('Seeding failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function seedPlans() {
  logger.info('Seeding plans...');
  
  const plans = [
    {
      name: 'Free',
      description: 'Perfect for getting started',
      price: 0,
      currency: 'USD',
      interval: 'month',
      stripe_price_id: 'price_free',
      stripe_product_id: 'prod_free',
      features: JSON.stringify([
        'Up to 3 projects',
        'Basic analytics',
        'Community support',
        '1GB storage'
      ]),
      is_active: true,
      is_public: true,
      trial_days: 0,
      sort_order: 1,
    },
    {
      name: 'Starter',
      description: 'For growing teams',
      price: 2900, // $29.00
      currency: 'USD',
      interval: 'month',
      stripe_price_id: 'price_starter_monthly',
      stripe_product_id: 'prod_starter',
      features: JSON.stringify([
        'Unlimited projects',
        'Advanced analytics',
        'Email support',
        '10GB storage',
        'API access',
        'Custom integrations'
      ]),
      is_active: true,
      is_public: true,
      trial_days: 14,
      sort_order: 2,
    },
    {
      name: 'Pro',
      description: 'For professional teams',
      price: 7900, // $79.00
      currency: 'USD',
      interval: 'month',
      stripe_price_id: 'price_pro_monthly',
      stripe_product_id: 'prod_pro',
      features: JSON.stringify([
        'Everything in Starter',
        'Priority support',
        '50GB storage',
        'Advanced security',
        'Team collaboration',
        'Custom domains',
        'SSO integration'
      ]),
      is_active: true,
      is_public: true,
      trial_days: 14,
      sort_order: 3,
    },
    {
      name: 'Enterprise',
      description: 'For large organizations',
      price: 19900, // $199.00
      currency: 'USD',
      interval: 'month',
      stripe_price_id: 'price_enterprise_monthly',
      stripe_product_id: 'prod_enterprise',
      features: JSON.stringify([
        'Everything in Pro',
        'Dedicated support',
        'Unlimited storage',
        'Custom contracts',
        'SLA guarantee',
        'On-premise option',
        'Advanced audit logs'
      ]),
      is_active: true,
      is_public: true,
      trial_days: 30,
      sort_order: 4,
    },
    {
      name: 'Starter Yearly',
      description: 'For growing teams (billed annually)',
      price: 29000, // $290.00 (2 months free)
      currency: 'USD',
      interval: 'year',
      stripe_price_id: 'price_starter_yearly',
      stripe_product_id: 'prod_starter',
      features: JSON.stringify([
        'Unlimited projects',
        'Advanced analytics',
        'Email support',
        '10GB storage',
        'API access',
        'Custom integrations',
        'Save 17% with yearly billing'
      ]),
      is_active: true,
      is_public: true,
      trial_days: 14,
      sort_order: 5,
    },
    {
      name: 'Pro Yearly',
      description: 'For professional teams (billed annually)',
      price: 79000, // $790.00 (2 months free)
      currency: 'USD',
      interval: 'year',
      stripe_price_id: 'price_pro_yearly',
      stripe_product_id: 'prod_pro',
      features: JSON.stringify([
        'Everything in Starter',
        'Priority support',
        '50GB storage',
        'Advanced security',
        'Team collaboration',
        'Custom domains',
        'SSO integration',
        'Save 17% with yearly billing'
      ]),
      is_active: true,
      is_public: true,
      trial_days: 14,
      sort_order: 6,
    },
  ];
  
  for (const plan of plans) {
    await query(
      `INSERT INTO plans (
        name, description, price, currency, interval, 
        stripe_price_id, stripe_product_id, features, 
        is_active, is_public, trial_days, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (stripe_price_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        features = EXCLUDED.features,
        updated_at = CURRENT_TIMESTAMP`,
      [
        plan.name,
        plan.description,
        plan.price,
        plan.currency,
        plan.interval,
        plan.stripe_price_id,
        plan.stripe_product_id,
        plan.features,
        plan.is_active,
        plan.is_public,
        plan.trial_days,
        plan.sort_order,
      ]
    );
  }
  
  logger.info(`Seeded ${plans.length} plans`);
}

async function seedDemoUsers() {
  logger.info('Seeding demo users...');
  
  const passwordHash = await bcrypt.hash('DemoPass123!', config.security.bcryptRounds);
  
  // Demo user with free plan
  const freeUser = await query(
    `INSERT INTO users (
      email, password_hash, first_name, last_name, 
      email_verified, role, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (email) DO UPDATE SET
      updated_at = CURRENT_TIMESTAMP
    RETURNING id`,
    ['demo@example.com', passwordHash, 'Demo', 'User', true, 'user']
  );
  
  // Demo admin
  const adminUser = await query(
    `INSERT INTO users (
      email, password_hash, first_name, last_name, 
      email_verified, role, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (email) DO UPDATE SET
      updated_at = CURRENT_TIMESTAMP
    RETURNING id`,
    ['admin@example.com', passwordHash, 'Admin', 'User', true, 'admin']
  );
  
  // Trial user
  const trialUser = await query(
    `INSERT INTO users (
      email, password_hash, first_name, last_name, 
      email_verified, role, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (email) DO UPDATE SET
      updated_at = CURRENT_TIMESTAMP
    RETURNING id`,
    ['trial@example.com', passwordHash, 'Trial', 'User', true, 'user']
  );
  
  // Get plan IDs
  const plans = await query('SELECT id, stripe_price_id FROM plans');
  const freePlan = plans.find(p => p.stripe_price_id === 'price_free');
  const starterPlan = plans.find(p => p.stripe_price_id === 'price_starter_monthly');
  
  // Create subscription for free user
  if (freePlan) {
    await query(
      `INSERT INTO subscriptions (
        user_id, plan_id, stripe_customer_id, stripe_subscription_id,
        status, current_period_start, current_period_end, cancel_at_period_end
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '1 year', false)
      ON CONFLICT (user_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        updated_at = CURRENT_TIMESTAMP`,
      [freeUser[0].id, freePlan.id, 'cus_demo_free', 'sub_demo_free', 'active']
    );
  }
  
  // Create trial subscription for trial user
  if (starterPlan) {
    await query(
      `INSERT INTO subscriptions (
        user_id, plan_id, stripe_customer_id, stripe_subscription_id,
        status, current_period_start, current_period_end, 
        trial_start, trial_end, cancel_at_period_end
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '14 days', NOW(), NOW() + INTERVAL '14 days', false)
      ON CONFLICT (user_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        updated_at = CURRENT_TIMESTAMP`,
      [trialUser[0].id, starterPlan.id, 'cus_demo_trial', 'sub_demo_trial', 'trialing']
    );
  }
  
  // Seed some usage data
  await query(
    `INSERT INTO usage (user_id, metric, value, recorded_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT DO NOTHING`,
    [freeUser[0].id, 'api_calls', 1250]
  );
  
  await query(
    `INSERT INTO usage (user_id, metric, value, recorded_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT DO NOTHING`,
    [freeUser[0].id, 'storage_mb', 450]
  );
  
  logger.info('Seeded demo users and subscriptions');
}

// Run seed if called directly
if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default seed;
