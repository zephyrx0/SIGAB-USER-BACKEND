/**
 * Database configuration for PostgreSQL connection
 * This file handles the database connection setup using environment variables
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// Load environment variables
const {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_SCHEMA,
  NODE_ENV,
  DATABASE_URL
} = process.env;

// Create connection pool configuration
// Prioritize DATABASE_URL for Railway deployment
const poolConfig = DATABASE_URL ? {
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
} : {
  host: DB_HOST,
  port: parseInt(DB_PORT, 10),
  database: DB_NAME,
  user: DB_USER,
  password: String(DB_PASSWORD),
  ssl: {
    rejectUnauthorized: false
  },
  // Connection pool settings for better performance
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000
};

// Create connection pool
const pool = new Pool(poolConfig);

// Handle pool events
pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', err);
  // Don't exit process in production, let it retry
  if (NODE_ENV !== 'production') {
    process.exit(-1);
  }
});

/**
 * Execute a query with automatic connection handling
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise} - Query result
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Executed query', { 
      text, 
      duration, 
      rows: res.rowCount 
    });
    
    return res;
  } catch (error) {
    logger.error('Query error', { text, error });
    throw error;
  }
};

/**
 * Get a client from the pool with transaction support
 * For use when multiple queries need to be executed in a transaction
 * @returns {Object} - Client object with begin, commit, rollback wrappers
 */
const getTransactionClient = async () => {
  const client = await pool.connect();
  
  // Wrap client methods to add transaction support
  const transactionClient = {
    query: (text, params) => client.query(text, params),
    begin: () => client.query('BEGIN'),
    commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK'),
    release: () => client.release()
  };
  
  return transactionClient;
};

// Testing the connection during initialization
const testConnection = async () => {
  try {
    const result = await query('SELECT NOW()');
    logger.info(`Database connection successful - Server time: ${result.rows[0].now}`);
    return true;
  } catch (err) {
    logger.error('Database connection failed', err);
    return false;
  }
};

// Graceful shutdown
const closePool = async () => {
  try {
    await pool.end();
    logger.info('Database pool closed successfully');
  } catch (err) {
    logger.error('Error closing database pool', err);
  }
};

module.exports = {
  query,
  getTransactionClient,
  testConnection,
  closePool,
  pool
};