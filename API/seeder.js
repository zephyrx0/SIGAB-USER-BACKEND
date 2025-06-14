/**
 * Main seeder file that runs all seeders
 */

require('dotenv').config();
const db = require('./src/config/database');
const { faker } = require('@faker-js/faker');
const bcrypt = require('bcrypt');

// Import individual seeders
const seedUserApp = require('./src/seeders/userAppSeeder');
const seedLaporan = require('./src/seeders/laporanSeeder');
const seedTipsMitigasi = require('./src/seeders/tipsMitigasiSeeder');
const seedInformasiBanjir = require('./src/seeders/informasiBanjirSeeder');
const seedTempatEvakuasi = require('./src/seeders/tempatEvakuasiSeeder');
const seedRiwayatBanjir = require('./src/seeders/riwayatBanjirSeeder');
const seedNotifikasi = require('./src/seeders/notifikasiSeeder');

/**
 * Main function to run all seeders
 */
const runAllSeeders = async () => {
  try {
    console.log('Starting database seeding...');
    
    // Test database connection
    const connected = await db.testConnection();
    if (!connected) {
      console.error('Database connection failed. Aborting seeding process.');
      process.exit(1);
    }
    
    // Run seeders in the correct order (respecting foreign key constraints)
    await seedUserApp();
    await seedInformasiBanjir();
    await seedLaporan();
    await seedTipsMitigasi();
    await seedTempatEvakuasi();
    await seedRiwayatBanjir(); // Depends on informasi_banjir
    await seedNotifikasi();
    
    console.log('All seeders completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error running seeders:', error);
    process.exit(1);
  }
};

// Run the seeders
runAllSeeders();