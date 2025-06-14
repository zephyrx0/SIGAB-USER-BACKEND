require('dotenv').config();
const pool = require('../config/database');
const { seedAdmin } = require('./adminSeeder');
const { seedUserApp } = require('./userAppSeeder');
const { seedTempatEvakuasi } = require('./tempatEvakuasiSeeder');
const { seedLaporan } = require('./laporanSeeder');
const { seedInformasiBanjir } = require('./informasiBanjirSeeder');
const { seedRiwayatBanjir } = require('./riwayatBanjirSeeder');
const { seedTipsMitigasi } = require('./tipsMitigasiSeeder');

const seedDatabase = async () => {
  try {
    // Membersihkan data yang ada sebelumnya
    await pool.query('TRUNCATE TABLE sigab_app.token_admin CASCADE');
    await pool.query('TRUNCATE TABLE sigab_app.tips_mitigasi CASCADE');
    await pool.query('TRUNCATE TABLE sigab_app.riwayat_banjir CASCADE');
    await pool.query('TRUNCATE TABLE sigab_app.laporan CASCADE');
    await pool.query('TRUNCATE TABLE sigab_app.informasi_banjir CASCADE');
    await pool.query('TRUNCATE TABLE sigab_app.tempat_evakuasi CASCADE');
    await pool.query('TRUNCATE TABLE sigab_app.user_app CASCADE');
    await pool.query('TRUNCATE TABLE sigab_app.admin CASCADE');

    console.log('Database telah dibersihkan');

    // Menjalankan seeder secara berurutan (sesuai dependensi)
    await seedAdmin(5);
    await seedUserApp(10);
    await seedTempatEvakuasi(5);
    await seedLaporan(15);
    await seedInformasiBanjir(10);
    await seedRiwayatBanjir(10);
    await seedTipsMitigasi(10);

    console.log('Seeding database selesai!');
  } catch (error) {
    console.error('Error saat melakukan seeding:', error);
  } finally {
    process.exit();
  }
};

seedDatabase();