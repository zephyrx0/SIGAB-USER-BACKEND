const { faker } = require('@faker-js/faker/locale/id_ID');
const { pool } = require('../config/database');

async function seedRiwayatBanjir(count = 10) {
  try {
    const admins = await pool.query('SELECT id_admin FROM sigab_app.admin');
    const kategori_kedalaman = ['Rendah', 'Sedang', 'Tinggi'];

    for (let i = 1; i <= count; i++) {
      const id_admin = admins.rows[Math.floor(Math.random() * admins.rows.length)].id_admin;
      const wilayah_banjir = faker.location.streetAddress();
      const kategori = kategori_kedalaman[Math.floor(Math.random() * kategori_kedalaman.length)];
      const waktu_kejadian = faker.date.past();
      const longitude = faker.location.longitude();
      const latitude = faker.location.latitude();
      const tingkat_kedalaman = `${faker.number.int({ min: 10, max: 200 })} cm`;

      await pool.query(
        'INSERT INTO sigab_app.riwayat_banjir (id_riwayat, id_admin, wilayah_banjir, kategori_kedalaman, waktu_kejadian, koordinat_lokasi, tingkat_kedalaman) VALUES ($1, $2, $3, $4, $5, point($6, $7), $8)',
        [i, id_admin, wilayah_banjir, kategori, waktu_kejadian, longitude, latitude, tingkat_kedalaman]
      );
    }
    console.log(`${count} riwayat banjir berhasil ditambahkan`);
  } catch (error) {
    console.error('Error seeding riwayat banjir:', error);
  }
}

module.exports = { seedRiwayatBanjir };