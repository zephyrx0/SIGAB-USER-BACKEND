const { query } = require('../config/database');
const logger = require('../utils/logger');

const createTables = async () => {
  try {
    // Create schema if not exists
    await query('CREATE SCHEMA IF NOT EXISTS sigab_app');
    
    // Create user_app table
    await query(`
      CREATE TABLE IF NOT EXISTS sigab_app.user_app (
        id_user SERIAL PRIMARY KEY,
        nomor_wa VARCHAR(20) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        nama VARCHAR(100),
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create laporan table
    await query(`
      CREATE TABLE IF NOT EXISTS sigab_app.laporan (
        id_laporan SERIAL PRIMARY KEY,
        id_user INTEGER REFERENCES sigab_app.user_app(id_user),
        tipe_laporan VARCHAR(50) NOT NULL,
        lokasi TEXT,
        waktu TIMESTAMP,
        deskripsi TEXT,
        status VARCHAR(20) DEFAULT 'Pending',
        foto VARCHAR(255),
        nama_lokasi VARCHAR(255),
        titik_lokasi POINT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create informasi_banjir table
    await query(`
      CREATE TABLE IF NOT EXISTS sigab_app.informasi_banjir (
        id_info_banjir SERIAL PRIMARY KEY,
        wilayah_banjir VARCHAR(255) NOT NULL,
        tingkat_kedalaman DECIMAL(5,2),
        kategori_kedalaman VARCHAR(50),
        waktu_kejadian TIMESTAMP,
        koordinat_lokasi POINT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create tips_mitigasi table
    await query(`
      CREATE TABLE IF NOT EXISTS sigab_app.tips_mitigasi (
        id_tips SERIAL PRIMARY KEY,
        judul VARCHAR(255) NOT NULL,
        deskripsi TEXT,
        media VARCHAR(255),
        tanggal_dibuat DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create tempat_evakuasi table
    await query(`
      CREATE TABLE IF NOT EXISTS sigab_app.tempat_evakuasi (
        id_tempat SERIAL PRIMARY KEY,
        nama_tempat VARCHAR(255) NOT NULL,
        foto VARCHAR(255),
        link_gmaps TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create riwayat_banjir table
    await query(`
      CREATE TABLE IF NOT EXISTS sigab_app.riwayat_banjir (
        id_riwayat SERIAL PRIMARY KEY,
        id_info_banjir INTEGER REFERENCES sigab_app.informasi_banjir(id_info_banjir),
        tanggal DATE,
        waktu_kejadian TIMESTAMP,
        wilayah_banjir VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create notifikasi table
    await query(`
      CREATE TABLE IF NOT EXISTS sigab_app.notifikasi (
        id_notifikasi SERIAL PRIMARY KEY,
        tipe_notifikasi VARCHAR(50),
        pesan TEXT,
        status VARCHAR(20) DEFAULT 'unread',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    logger.info('Database tables created successfully');
    return true;
  } catch (error) {
    logger.error('Error creating tables:', error);
    throw error;
  }
};

const runMigrations = async () => {
  try {
    logger.info('Starting database migrations...');
    await createTables();
    logger.info('Database migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
};

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = { createTables, runMigrations }; 