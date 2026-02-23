import pool from './pool';
import logger from '../utils/logger';

async function reset() {
  const client = await pool.connect();
  
  try {
    logger.warn('Resetting database... This will delete all data!');
    
    // Disable foreign key checks temporarily
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    
    // Truncate all tables
    const tables = [
      'audit_logs',
      'webhook_events',
      'refresh_tokens',
      'usage',
      'invoices',
      'subscriptions',
      'plans',
      'users',
      'migrations',
    ];
    
    for (const table of tables) {
      await client.query(`TRUNCATE TABLE ${table} CASCADE`);
      logger.info(`Truncated table: ${table}`);
    }
    
    logger.info('Database reset completed');
  } catch (error) {
    logger.error('Reset failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run reset if called directly
if (require.main === module) {
  reset()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default reset;
