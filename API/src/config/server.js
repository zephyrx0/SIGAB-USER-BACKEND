const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const setupServer = () => {
  const app = express();
  
  // Konfigurasi CORS yang lebih lengkap
  app.use(cors({
    origin: '*', // atau ganti dengan domain frontend kamu
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // (Opsional) Tangani preflight secara manual jika perlu
  app.options('*', cors());

  // Middleware lain
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  
  return app;
};

module.exports = { setupServer };