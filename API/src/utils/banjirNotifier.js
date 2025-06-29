const pool = require('../config/database');
const { sendFcmTopicNotification, sendFcmToAllTokens } = require('./fcm');
const { kirimWhatsappKeSemuaUser } = require('./twilioNotifier');

// Flag untuk menandakan job sedang berjalan
let isJobRunning = false;

async function kirimNotifikasiBanjirTerbaru() {
  if (isJobRunning) {
    console.log('[BANJIR][CRON] Skip, job sebelumnya masih berjalan.');
    return;
  }

  isJobRunning = true; // Set lock
  console.log('[BANJIR][CRON] Memulai pengecekan notifikasi banjir...');
  
  try {
    const result = await pool.query(
      'SELECT wilayah_banjir FROM sigab_app.informasi_banjir ORDER BY waktu_kejadian DESC LIMIT 1'
    );
    if (result.rows.length === 0) {
      console.log('[BANJIR][CRON] Tidak ada data banjir tersedia');
      return;
    }
    const { wilayah_banjir } = result.rows[0];
    const deskripsi = `Banjir terdeteksi di wilayah ${wilayah_banjir}, Mohon waspada`;

    // Cek manual sebelum insert
    const cek = await pool.query(
      `SELECT 1 FROM sigab_app.notifikasi 
       WHERE judul = $1 
         AND pesan = $2 
         AND DATE(created_at) = CURRENT_DATE
       LIMIT 1`,
      ['Informasi Banjir Terbaru', deskripsi]
    );
    if (cek.rows.length > 0) {
      console.log('[BANJIR][CRON] Notifikasi sudah pernah dikirim hari ini, skip.');
      return;
    }

    // Simpan ke tabel notifikasi
    await pool.query(
      'INSERT INTO sigab_app.notifikasi (judul, pesan, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
      ['Informasi Banjir Terbaru', deskripsi]
    );
    console.log('[BANJIR][DB] Notifikasi berhasil disimpan ke database');

    // Kirim ke FCM Topic (untuk device online)
    try {
      await sendFcmTopicNotification(
        'peringatan-umum',
        'Informasi Banjir Terbaru',
        deskripsi,
        { wilayah_banjir, type: 'banjir' }
      );
      console.log('[BANJIR][FCM-TOPIC] Notifikasi topic berhasil dikirim');
    } catch (topicError) {
      console.error('[BANJIR][FCM-TOPIC] Error:', topicError.message);
    }

    // Kirim ke semua token terdaftar (untuk device offline)
    try {
      const fcmResult = await sendFcmToAllTokens(
        'Informasi Banjir Terbaru',
        deskripsi,
        { wilayah_banjir, type: 'banjir' }
      );
      console.log(`[BANJIR][FCM-TOKENS] Sent: ${fcmResult.success}, Failed: ${fcmResult.fail}`);
    } catch (tokenError) {
      console.error('[BANJIR][FCM-TOKENS] Error:', tokenError.message);
    }

    // Kirim WhatsApp ke semua user
    await kirimWhatsappKeSemuaUser(deskripsi);
  } catch (error) {
    console.error('[BANJIR][CRON][ERROR]', error.message);
  } finally {
    isJobRunning = false;
  }
}

module.exports = { kirimNotifikasiBanjirTerbaru };