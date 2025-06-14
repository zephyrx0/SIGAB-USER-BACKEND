const { faker } = require('@faker-js/faker/locale/id_ID');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

async function seedUserApp(count = 10) {
  try {
    for (let i = 1; i <= count; i++) {
      const nama = faker.person.fullName();
      // Menggunakan method baru untuk generate nomor telepon
      const nomor_wa = faker.helpers.fromRegExp('08[0-9]{10}');
      const password = await bcrypt.hash('user123', 10);

      await pool.query(
        'INSERT INTO sigab_app.user_app (id_user, nomor_wa, password, nama) VALUES ($1, $2, $3, $4)',
        [i, nomor_wa, password, nama]
      );
    }
    console.log(`${count} user app berhasil ditambahkan`);
  } catch (error) {
    console.error('Error seeding user app:', error);
  }
}

module.exports = { seedUserApp };