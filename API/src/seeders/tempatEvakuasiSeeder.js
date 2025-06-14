const { faker } = require('@faker-js/faker/locale/id_ID');
const { pool } = require('../config/database');

async function seedTempatEvakuasi(count = 5) {
  try {
    for (let i = 1; i <= count; i++) {
      const nama_tempat = `Tempat Evakuasi ${faker.location.street()}`;
      const link_gmaps = faker.internet.url();
      const foto = faker.image.url();

      await pool.query(
        'INSERT INTO sigab_app.tempat_evakuasi (id_evakuasi, nama_tempat, link_gmaps, foto) VALUES ($1, $2, $3, $4)',
        [i, nama_tempat, link_gmaps, foto]
      );
    }
    console.log(`${count} tempat evakuasi berhasil ditambahkan`);
  } catch (error) {
    console.error('Error seeding tempat evakuasi:', error);
  }
}

module.exports = { seedTempatEvakuasi };