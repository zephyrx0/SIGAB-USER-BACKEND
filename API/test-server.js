/**
 * Database Connection Test Script
 * Script sederhana untuk menguji koneksi database PostgreSQL
 */

// Load environment variables
require('dotenv').config();

// Import PostgreSQL client
const { Pool } = require('pg');

// Log database configuration (tanpa data sensitif)
console.log('Mencoba koneksi ke database dengan konfigurasi:');
console.log({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  // password tidak ditampilkan untuk keamanan
  schema: process.env.DB_SCHEMA
});

// Buat konfigurasi pool
const poolConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
};

// Buat pool koneksi
const pool = new Pool(poolConfig);

// Fungsi untuk menguji koneksi
async function testConnection() {
  console.log('Menguji koneksi database...');
  
  try {
    // Coba eksekusi query sederhana
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Koneksi database berhasil!');
    console.log(`⏰ Waktu server database: ${result.rows[0].now}`);
    
    // Coba query untuk informasi versi PostgreSQL
    const versionResult = await pool.query('SELECT version()');
    console.log(`ℹ️ Versi PostgreSQL: ${versionResult.rows[0].version}`);
    
    return true;
  } catch (error) {
    console.error('❌ Koneksi database gagal!');
    console.error('Error details:', error.message);
    
    // Tambahan debugging untuk masalah koneksi
    if (error.code === 'ECONNREFUSED') {
      console.error('Tidak dapat terhubung ke server database. Pastikan PostgreSQL berjalan dan dapat diakses.');
    } else if (error.code === '28P01') {
      console.error('Autentikasi gagal. Periksa username dan password.');
    } else if (error.code === '3D000') {
      console.error('Database tidak ditemukan. Periksa nama database.');
    }
    
    return false;
  } finally {
    // Tutup pool koneksi
    await pool.end();
    console.log('Pool koneksi ditutup');
  }
}

// Jalankan tes koneksi
testConnection()
  .then(success => {
    if (success) {
      console.log('Test selesai dengan sukses. Database siap digunakan.');
    } else {
      console.log('Test selesai dengan kegagalan. Silakan periksa konfigurasi database.');
    }
    // Keluar dari proses
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Terjadi kesalahan tidak terduga:', err);
    process.exit(1);
  });