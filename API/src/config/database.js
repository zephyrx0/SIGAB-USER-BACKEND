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
  NODE_ENV
} = process.env;

// Create connection pool configuration
// Hapus atau gunakan salah satu dari konfigurasi pool ini
// const poolConfig = {
//   host: DB_HOST,
//   port: parseInt(DB_PORT, 10),
//   database: DB_NAME,
//   user: DB_USER,
//   password: DB_PASSWORD,
//   schema: DB_SCHEMA,
//   // Set additional options based on environment
//   ssl: NODE_ENV === 'production',
//   // Add statement timeout to prevent long-running queries
//   statement_timeout: 30000, // 30 seconds
//   // Connection pool settings
//   max: 20, // Maximum number of clients in the pool
//   idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
//   connectionTimeoutMillis: 10000, // How long to wait for a connection to become available
// };

// Create connection pool
// Dan
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
  ssl: {
    rejectUnauthorized: false // Diperlukan untuk koneksi ke Aiven
  }
});

// Handle pool events
pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
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

module.exports = {
  query,
  getTransactionClient,
  testConnection,
  pool
};