const { faker } = require('@faker-js/faker/locale/id_ID');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

async function seedAdmin(count = 5) {
  try {
    for (let i = 1; i <= count; i++) {
      const nama = faker.person.fullName();
      const username = faker.internet.userName({ firstName: nama.split(' ')[0] });
      const password = await bcrypt.hash('admin123', 10);

      await pool.query(
        'INSERT INTO sigab_app.admin (id_admin, nama, username, password) VALUES ($1, $2, $3, $4)',
        [i, nama, username, password]
      );
    }
    console.log(`${count} admin berhasil ditambahkan`);
  } catch (error) {
    console.error('Error seeding admin:', error);
  }
}

module.exports = { seedAdmin };