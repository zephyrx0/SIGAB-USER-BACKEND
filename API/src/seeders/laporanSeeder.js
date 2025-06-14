const { faker } = require('@faker-js/faker/locale/id_ID');
const { pool } = require('../config/database');

async function seedLaporan(count = 15) {
  try {
    const users = await pool.query('SELECT id_user FROM sigab_app.user_app');
    const admins = await pool.query('SELECT id_admin FROM sigab_app.admin');
    const tipe_laporan = ['Infrastruktur', 'Banjir'];
    const status = ['Valid', 'Tidak Valid'];

    for (let i = 1; i <= count; i++) {
      const id_user = users.rows[Math.floor(Math.random() * users.rows.length)].id_user;
      const tipe = tipe_laporan[Math.floor(Math.random() * tipe_laporan.length)];
      const waktu = faker.date.past();
      const deskripsi = faker.lorem.paragraph();
      const status_laporan = status[Math.floor(Math.random() * status.length)];
      const id_admin = admins.rows[Math.floor(Math.random() * admins.rows.length)].id_admin;
      const foto = faker.image.url();
      const lokasi = faker.location.streetAddress();
      const longitude = faker.location.longitude();
      const latitude = faker.location.latitude();

      await pool.query(
        'INSERT INTO sigab_app.laporan (id_laporan, id_user, tipe_laporan, waktu, deskripsi, status, id_admin, foto, lokasi, titik_lokasi) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, point($10, $11))',
        [i, id_user, tipe, waktu, deskripsi, status_laporan, id_admin, foto, lokasi, longitude, latitude]
      );
    }
    console.log(`${count} laporan berhasil ditambahkan`);
  } catch (error) {
    console.error('Error seeding laporan:', error);
  }
}

module.exports = { seedLaporan };