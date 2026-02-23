import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import logger from '../utils/logger';

// Create a new pool instance
const pool = new Pool({
  connectionString: config.database.url,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection not established
  ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
});

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test connection on startup
pool.connect()
  .then((client) => {
    logger.info('Database connected successfully');
    client.release();
  })
  .catch((err) => {
    logger.error('Database connection error:', err);
    process.exit(-1);
  });

// Helper function for transactions
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Helper function for single queries
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  
  // Log slow queries in development
  if (config.nodeEnv === 'development' && duration > 100) {
    logger.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}...`);
  }
  
  return result.rows as T[];
}

// Get a single row or null
export async function queryOne<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export default pool;
