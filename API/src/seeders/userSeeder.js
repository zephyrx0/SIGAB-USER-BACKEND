const { faker } = require('@faker-js/faker/locale/id_ID');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function seedUsers(count = 10) {
  try {
    // Membersihkan data yang ada sebelumnya
    await pool.query('TRUNCATE TABLE sigab_app.users CASCADE');
    
    for (let i = 0; i < count; i++) {
      const id = uuidv4();
      const nama_lengkap = faker.person.fullName();
      const email = faker.internet.email({ firstName: nama_lengkap.split(' ')[0] });
      const password = await bcrypt.hash('password123', 10);
      const nomor_telepon = faker.phone.number('08##########');
      const alamat = faker.location.streetAddress({ country: 'ID' });
      const foto_profil = faker.image.avatar();
      const created_at = faker.date.past();
      const updated_at = faker.date.between({ from: created_at, to: new Date() });

      await pool.query(
        'INSERT INTO sigab_app.users (id, nama_lengkap, email, password, nomor_telepon, alamat, foto_profil, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [id, nama_lengkap, email, password, nomor_telepon, alamat, foto_profil, created_at, updated_at]
      );
    }
    console.log(`${count} users berhasil ditambahkan`);
  } catch (error) {
    console.error('Error seeding users:', error);
  }
}

module.exports = { seedUsers };