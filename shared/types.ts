// Shared types between frontend and backend

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
  subscription?: Subscription;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  createdAt: string;
  updatedAt: string;
  plan: Plan;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'month' | 'year' | 'one_time';
  stripePriceId: string;
  features: string[];
  isActive: boolean;
  trialDays: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  userId: string;
  subscriptionId: string | null;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  invoicePdf: string | null;
  hostedInvoiceUrl: string | null;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
}

export interface Usage {
  id: string;
  userId: string;
  metric: string;
  value: number;
  recordedAt: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  firstName: string;
  lastName: string;
  confirmPassword: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse extends ApiResponse<AuthTokens> {
  user: User;
}

// Dashboard types
export interface DashboardStats {
  totalUsers: number;
  activeSubscriptions: number;
  mrr: number;
  churnRate: number;
}

export interface UserUsage {
  metric: string;
  current: number;
  limit: number;
  percentage: number;
}

export interface UserDashboard {
  user: User;
  usage: UserUsage[];
  recentInvoices: Invoice[];
}
