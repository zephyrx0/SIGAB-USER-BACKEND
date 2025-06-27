const pool = require('../config/database');
const { sendFcmTopicNotification } = require('./fcm');

// Fungsi untuk kirim notifikasi peringatan banjir terbaru
async function kirimNotifikasiBanjirTerbaru() {
  const result = await pool.query(
    'SELECT wilayah_banjir FROM sigab_app.informasi_banjir ORDER BY waktu_kejadian DESC LIMIT 1'
  );
  if (result.rows.length === 0) return;
  const { wilayah_banjir } = result.rows[0];
  const deskripsi = `Banjir terdeteksi di wilayah ${wilayah_banjir}, Mohon waspada`;

  // Cek duplikasi hanya untuk hari ini
  const cek = await pool.query(
    `SELECT 1 FROM sigab_app.notifikasi 
     WHERE judul = $1 
       AND pesan = $2 
       AND DATE(created_at) = CURRENT_DATE
     LIMIT 1`,
    ['Informasi Banjir Terbaru', deskripsi]
  );
  if (cek.rows.length > 0) {
    console.log('[BANJIR] Notifikasi sudah pernah dikirim hari ini, skip.');
    return;
  }

  // Kirim notifikasi
  await sendFcmTopicNotification(
    'peringatan-banjir',
    'Informasi Banjir Terbaru',
    deskripsi,
    { wilayah_banjir }
  );

  // Simpan ke tabel notifikasi
  await pool.query(
    'INSERT INTO sigab_app.notifikasi (judul, pesan, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
    ['Informasi Banjir Terbaru', deskripsi]
  );
}

module.exports = { kirimNotifikasiBanjirTerbaru }; 