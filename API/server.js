const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
require('dotenv').config();
const { createLogger, format, transports } = require('winston');
const { testConnection, closePool } = require('./src/config/database');

// Konfigurasi logger
const logger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' })
  ]
});

// Tambahkan console transport untuk development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: format.simple()
  }));
}

// Log environment variables (without sensitive data)
console.log('Environment:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  hasSupabaseUrl: !!process.env.SUPABASE_URL,
  hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY,
  hasDatabaseUrl: !!process.env.DATABASE_URL
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Import routes
const appRoutes = require('./src/routes/appRoutes');
const userRoutes = require('./src/routes/userRoutes');

// Gunakan routes
app.use('/api/app', appRoutes);
app.use('/api/users', userRoutes);

// Endpoint root
app.get('/', (req, res) => {
  res.json({
    message: 'Selamat datang di API SIGAB (Sistem Informasi dan Kesiapsiagaan Banjir)',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    res.json({
      status: 'ok',
      database: dbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Terjadi kesalahan pada server'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint tidak ditemukan'
  });
});

// Jalankan server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  logger.info(`Server SIGAB berjalan di port ${PORT}`);
}).on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  logger.error('Uncaught Exception:', err);
  // Graceful shutdown
  server.close(() => {
    closePool().then(() => {
      process.exit(1);
    });
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Graceful shutdown
  server.close(() => {
    closePool().then(() => {
      process.exit(1);
    });
  });
});

// Graceful shutdown on SIGTERM
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    closePool().then(() => {
      logger.info('Process terminated');
      process.exit(0);
    });
  });
});

// Graceful shutdown on SIGINT
process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    closePool().then(() => {
      logger.info('Process terminated');
      process.exit(0);
    });
  });
});

module.exports = app;