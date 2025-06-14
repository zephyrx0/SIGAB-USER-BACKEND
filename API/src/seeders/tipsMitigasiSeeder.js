const { faker } = require('@faker-js/faker/locale/id_ID');
const { pool } = require('../config/database');

async function seedTipsMitigasi(count = 10) {
  try {
    const admins = await pool.query('SELECT id_admin FROM sigab_app.admin');

    for (let i = 1; i <= count; i++) {
      const id_admin = admins.rows[Math.floor(Math.random() * admins.rows.length)].id_admin;
      const judul = faker.lorem.sentence(5);
      const deskripsi = faker.lorem.paragraphs(3);
      const media = faker.image.url();
      const tanggal_dibuat = faker.date.past();

      await pool.query(
        'INSERT INTO sigab_app.tips_mitigasi (id_tips, id_admin, judul, deskripsi, media, tanggal_dibuat) VALUES ($1, $2, $3, $4, $5, $6)',
        [i, id_admin, judul, deskripsi, media, tanggal_dibuat]
      );
    }
    console.log(`${count} tips mitigasi berhasil ditambahkan`);
  } catch (error) {
    console.error('Error seeding tips mitigasi:', error);
  }
}

module.exports = { seedTipsMitigasi };