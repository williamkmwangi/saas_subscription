# SaaS Subscription Demo

A secure, full-stack SaaS landing page and subscription management application built with React, Node.js/Express, Stripe, and PostgreSQL.

## Features

### Core Features (MVP)
- **Responsive Landing Pages**: Hero, features, pricing, contact
- **Authentication**: Email/password signup/login with JWT session management
- **Email Verification**: Secure email verification flow
- **Password Reset**: Secure password reset with token-based authentication
- **Stripe Integration**: One-time and recurring subscription payments
- **Plans & Pricing**: Public plans with internal metadata
- **Customer Billing Portal**: Stripe-hosted billing management
- **User Dashboard**: Overview with usage metrics and subscription status
- **Account Settings**: Profile management, password change, account deletion
- **Webhook Handlers**: Process Stripe events (payments, subscription updates)
- **PostgreSQL Schema**: Users, subscriptions, invoices, plans, usage tracking
- **Security**: Helmet, rate limiting, input validation, CORS protection

### Security Features
- **Helmet.js**: Security headers (CSP, HSTS, X-Frame-Options, etc.)
- **Rate Limiting**: Protection against brute force and DDoS attacks
- **Input Validation**: Express-validator for all user inputs
- **Password Security**: bcrypt with configurable rounds (default: 12)
- **JWT Authentication**: Access and refresh tokens with rotation
- **SQL Injection Protection**: Parameterized queries with pg
- **XSS Protection**: Input sanitization and CSP headers
- **CORS**: Configured for specific origins only
- **Account Lockout**: After 5 failed login attempts
- **Secure Headers**: Comprehensive security header configuration

## Tech Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL 14+
- **ORM**: Raw SQL with pg driver
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs
- **Payment**: Stripe
- **Email**: Nodemailer
- **Security**: Helmet, express-rate-limit, hpp, cors
- **Logging**: Winston

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Routing**: React Router DOM
- **HTTP Client**: Axios
- **Notifications**: react-hot-toast
- **SEO**: react-helmet-async

## Prerequisites

- Node.js 18 or higher
- PostgreSQL 14 or higher
- Stripe account (for payments)
- SMTP server (for emails - optional in development)

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd saas_subscription

# Install root dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### 2. Environment Setup

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/saas_demo

# JWT Secrets (generate strong random strings)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this-in-production

# Stripe (get from https://dashboard.stripe.com)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Email (optional for development)
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 3. Database Setup

```bash
# Create database (if using local PostgreSQL)
createdb saas_demo

# Run migrations
npm run db:migrate

# Seed with sample data
npm run db:seed
```

### 4. Start Development Servers

```bash
# Start both frontend and backend
npm run dev

# Or start separately:
npm run dev:server  # Backend on http://localhost:3001
npm run dev:client  # Frontend on http://localhost:5173
```

### 5. Access the Application

- **Landing Page**: http://localhost:5173
- **API**: http://localhost:3001
- **Demo Login**: demo@example.com / DemoPass123!

## Stripe Setup

### 1. Create Stripe Account
Sign up at https://stripe.com and get your API keys from the dashboard.

### 2. Configure Webhooks
For local development, use Stripe CLI:

```bash
# Install Stripe CLI (https://stripe.com/docs/stripe-cli)
# Login to Stripe
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:3001/webhooks/stripe
```

The CLI will provide a webhook signing secret. Add this to your `.env`:
```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Create Products and Prices

You can either:
- Create them in the Stripe Dashboard and update the seed data
- Or use the seeded plans (they use placeholder price IDs for demo)

### 4. Test Cards

Use these test card numbers:
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **Require 3D Secure**: `4000 0025 0000 3155`

Use any future date for expiry and any 3 digits for CVC.

## Project Structure

```
saas_subscription/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── layouts/        # Page layouts
│   │   ├── pages/          # Route pages
│   │   ├── store/          # Zustand stores
│   │   └── utils/          # Utilities
│   └── package.json
├── server/                 # Express backend
│   ├── config/             # Configuration
│   ├── db/                 # Database schema & migrations
│   ├── middleware/         # Express middleware
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   └── utils/              # Utilities
├── shared/                 # Shared TypeScript types
├── docker-compose.yml      # Docker setup
└── package.json
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/verify-email` - Verify email
- `POST /api/auth/change-password` - Change password (authenticated)

### Plans
- `GET /api/plans` - Get all public plans
- `GET /api/plans/:id` - Get plan by ID

### Subscriptions
- `GET /api/subscriptions/current` - Get current subscription
- `POST /api/subscriptions/checkout` - Create checkout session
- `POST /api/subscriptions/billing-portal` - Create billing portal
- `POST /api/subscriptions/cancel` - Cancel subscription
- `POST /api/subscriptions/resume` - Resume subscription
- `GET /api/subscriptions/invoices` - Get invoice history

### Dashboard
- `GET /api/dashboard` - Get dashboard data
- `GET /api/dashboard/usage` - Get usage history

### Profile
- `GET /api/profile` - Get profile
- `PATCH /api/profile` - Update profile
- `DELETE /api/profile` - Delete account

### Webhooks
- `POST /webhooks/stripe` - Stripe webhook handler

## Database Schema

### Users
- `id` (UUID, PK)
- `email` (string, unique)
- `password_hash` (string)
- `first_name`, `last_name`
- `email_verified` (boolean)
- `role` (enum: user, admin)
- `stripe_customer_id`
- Security fields: `failed_login_attempts`, `locked_until`
- Timestamps: `created_at`, `updated_at`, `deleted_at`

### Plans
- `id` (UUID, PK)
- `name`, `description`
- `price` (integer, cents)
- `currency`, `interval`
- `stripe_price_id`, `stripe_product_id`
- `features` (JSONB)
- `is_active`, `is_public`
- `trial_days`

### Subscriptions
- `id` (UUID, PK)
- `user_id` (FK), `plan_id` (FK)
- `stripe_customer_id`, `stripe_subscription_id`
- `status` (enum)
- `current_period_start`, `current_period_end`
- `cancel_at_period_end`, `canceled_at`
- `trial_start`, `trial_end`

### Invoices
- `id` (UUID, PK)
- `user_id` (FK), `subscription_id` (FK)
- `stripe_invoice_id`
- `amount`, `currency`, `status`
- `invoice_pdf`, `hosted_invoice_url`

## Deployment

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3001

# Database (use connection string from your provider)
DATABASE_URL=postgresql://...

# JWT (use strong, random secrets)
JWT_SECRET=...
JWT_REFRESH_SECRET=...

# Stripe (use live keys for production)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (use a transactional email service)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=...
EMAIL_FROM=noreply@yourdomain.com

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Build for Production

```bash
# Build frontend and backend
npm run build

# Start production server
npm start
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Heroku Deployment

1. Create a Heroku app
2. Add PostgreSQL addon: `heroku addons:create heroku-postgresql:mini`
3. Set environment variables: `heroku config:set KEY=value`
4. Deploy: `git push heroku main`
5. Run migrations: `heroku run npm run db:migrate`
6. Seed data: `heroku run npm run db:seed`

### Vercel Deployment (Frontend)

1. Connect your GitHub repo to Vercel
2. Set root directory to `client`
3. Add environment variables in Vercel dashboard
4. Deploy

## Security Considerations

### Production Checklist

- [ ] Use strong, unique JWT secrets
- [ ] Enable HTTPS only
- [ ] Set secure CORS origins
- [ ] Configure rate limiting appropriately
- [ ] Use production Stripe keys
- [ ] Set up proper email service
- [ ] Enable database SSL
- [ ] Set up logging and monitoring
- [ ] Configure backup strategy
- [ ] Review and test all security headers

### Environment Security

- Never commit `.env` files
- Use different secrets for each environment
- Rotate secrets regularly
- Use a secrets manager in production

## Development

### Available Scripts

```bash
# Development
npm run dev              # Start both frontend and backend
npm run dev:server       # Start backend only
npm run dev:client       # Start frontend only

# Database
npm run db:migrate       # Run database migrations
npm run db:seed          # Seed database with sample data
npm run db:reset         # Reset database (WARNING: deletes all data)

# Build
npm run build            # Build for production
npm run build:server     # Build backend only
npm run build:client     # Build frontend only

# Testing
npm run test             # Run tests
npm run test:watch       # Run tests in watch mode

# Linting
npm run lint             # Run ESLint
npm run typecheck        # Run TypeScript type checking
```

### Adding New Features

1. **Backend**: Add route handlers in `server/routes/`
2. **Frontend**: Add pages in `client/src/pages/`
3. **Database**: Add migrations in `server/db/schema.sql`
4. **Types**: Update shared types in `shared/types.ts`

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready

# Check database exists
psql -l | grep saas_demo

# Reset database
npm run db:reset
npm run db:migrate
npm run db:seed
```

### Stripe Webhook Issues

```bash
# Verify webhook forwarding
stripe listen --print-secret

# Test webhook manually
curl -X POST http://localhost:3001/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Build Issues

```bash
# Clean and reinstall
rm -rf node_modules client/node_modules
npm install
cd client && npm install && cd ..

# Clear TypeScript cache
npm run typecheck -- --noEmit
```

## License

MIT License - feel free to use this for your own projects!

## Support

For issues and questions:
- Open an issue on GitHub
- Email: support@saasdemo.com

