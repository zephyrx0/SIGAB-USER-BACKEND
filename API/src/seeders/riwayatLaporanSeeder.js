const { faker } = require('@faker-js/faker');
const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function seedRiwayatLaporan(count = 30) {
  try {
    // Membersihkan data yang ada sebelumnya
    await pool.query('TRUNCATE TABLE sigab_app.riwayat_laporan CASCADE');
    
    const users = await pool.query('SELECT id FROM sigab_app.users');
    const laporanBanjir = await pool.query('SELECT id FROM sigab_app.laporan_banjir');
    const laporanInfrastruktur = await pool.query('SELECT id FROM sigab_app.laporan_infrastruktur');

    for (let i = 0; i < count; i++) {
      const id = uuidv4();
      const user_id = users.rows[Math.floor(Math.random() * users.rows.length)].id;
      const waktu = faker.date.past();
      const tipe = Math.random() < 0.5 ? 'Banjir' : 'Infrastruktur';
      
      let laporan_id;
      if (tipe === 'Banjir' && laporanBanjir.rows.length > 0) {
        laporan_id = laporanBanjir.rows[Math.floor(Math.random() * laporanBanjir.rows.length)].id;
      } else if (tipe === 'Infrastruktur' && laporanInfrastruktur.rows.length > 0) {
        laporan_id = laporanInfrastruktur.rows[Math.floor(Math.random() * laporanInfrastruktur.rows.length)].id;
      } else {
        continue;
      }

      await pool.query(
        'INSERT INTO sigab_app.riwayat_laporan (id, user_id, tipe_laporan, laporan_id, waktu) VALUES ($1, $2, $3, $4, $5)',
        [id, user_id, tipe, laporan_id, waktu]
      );
    }
    console.log(`${count} riwayat laporan berhasil ditambahkan`);
  } catch (error) {
    console.error('Error seeding riwayat laporan:', error);
  }
}

module.exports = { seedRiwayatLaporan };