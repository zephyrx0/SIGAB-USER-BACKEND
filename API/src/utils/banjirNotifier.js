const pool = require('../config/database');
const { sendFcmTopicNotification } = require('./fcm');

// Fungsi untuk kirim notifikasi peringatan banjir terbaru
async function kirimNotifikasiBanjirTerbaru() {
  console.log('[BANJIR][CRON] Memulai pengecekan notifikasi banjir...');
  
  // Cek apakah sudah ada notifikasi banjir hari ini
  const existingNotification = await pool.query(
    `SELECT 1 FROM sigab_app.notifikasi 
     WHERE judul = 'Informasi Banjir Terbaru'
     AND DATE(created_at) = CURRENT_DATE
     LIMIT 1`
  );
  
  if (existingNotification.rows.length > 0) {
    console.log('[BANJIR][CRON] Notifikasi banjir sudah pernah dikirim hari ini, skip.');
    return;
  }
  
  const result = await pool.query(
    'SELECT wilayah_banjir FROM sigab_app.informasi_banjir ORDER BY waktu_kejadian DESC LIMIT 1'
  );
  if (result.rows.length === 0) {
    console.log('[BANJIR][CRON] Tidak ada data banjir tersedia');
    return;
  }
  const { wilayah_banjir } = result.rows[0];
  const deskripsi = `Banjir terdeteksi di wilayah ${wilayah_banjir}, Mohon waspada`;

  // Kirim notifikasi
  console.log('[BANJIR][FCM] Akan mengirim notifikasi ke topic: peringatan-umum', 'Informasi Banjir Terbaru', deskripsi);
  await sendFcmTopicNotification(
    'peringatan-umum',
    'Informasi Banjir Terbaru',
    deskripsi,
    { wilayah_banjir }
  );
  console.log('[BANJIR][FCM] Selesai kirim notifikasi ke topic: peringatan-umum');

  // Simpan ke tabel notifikasi
  await pool.query(
    'INSERT INTO sigab_app.notifikasi (judul, pesan, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
    ['Informasi Banjir Terbaru', deskripsi]
  );
  console.log('[BANJIR][DB] Notifikasi berhasil disimpan ke database');
}

module.exports = { kirimNotifikasiBanjirTerbaru }; 