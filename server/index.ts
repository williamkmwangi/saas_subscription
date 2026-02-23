import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config';
import logger from './utils/logger';

// Import middleware
import {
  corsMiddleware,
  helmetMiddleware,
  apiLimiter,
  hppMiddleware,
  sanitizeRequest,
  securityHeaders,
  requestLogger,
  securityErrorHandler,
} from './middleware/security';

// Import routes
import authRoutes from './routes/auth';
import plansRoutes from './routes/plans';
import subscriptionsRoutes from './routes/subscriptions';
import dashboardRoutes from './routes/dashboard';
import profileRoutes from './routes/profile';
import webhooksRoutes from './routes/webhooks';

// Initialize Express app
const app = express();

// Trust proxy (required for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(securityHeaders);
app.use(hppMiddleware);
app.use(sanitizeRequest);

// Request logging
app.use(requestLogger);

// Body parsing (except for webhooks which need raw body)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// API routes with rate limiting
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/plans', apiLimiter, plansRoutes);
app.use('/api/subscriptions', apiLimiter, subscriptionsRoutes);
app.use('/api/dashboard', apiLimiter, dashboardRoutes);
app.use('/api/profile', apiLimiter, profileRoutes);

// Webhooks (raw body parser, separate rate limit)
app.use('/webhooks', webhooksRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
    },
  });
});

// Security error handler
app.use(securityErrorHandler);

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error:', err);
  
  // Don't leak error details in production
  const message = config.nodeEnv === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  });
});

// Start server
const server = app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  process.exit(1);
});

export default app;
