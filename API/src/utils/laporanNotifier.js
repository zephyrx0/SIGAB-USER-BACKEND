const pool = require('../config/database');
const { sendFcmTopicNotification, sendFcmToAllTokens } = require('./fcm');
const { kirimWhatsappKeSemuaUser } = require('./twilioNotifier');

async function kirimNotifikasiTigaLaporanValid() {
  // Cek manual sebelum insert
  const cek = await pool.query(
    `SELECT 1 FROM sigab_app.notifikasi
     WHERE judul = $1
     AND pesan = $2
     AND DATE(created_at) = CURRENT_DATE
     LIMIT 1`,
    [
      'Peringatan Dini Banjir',
      'Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.'
    ]
  );
  if (cek.rows.length > 0) {
    console.log('[LAPORAN][CRON] Notifikasi sudah pernah dikirim hari ini, skip.');
    return;
  }
  
  // Simpan ke tabel notifikasi
  await pool.query(
    `INSERT INTO sigab_app.notifikasi (judul, pesan, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())`,
    [
      'Peringatan Dini Banjir',
      'Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.'
    ]
  );
  
  // Kirim ke FCM Topic (untuk device online)
  try {
    await sendFcmTopicNotification(
      'peringatan-umum',
      'Peringatan Dini Banjir',
      'Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.',
      { type: 'laporan' }
    );
    console.log('[LAPORAN][FCM-TOPIC] Notifikasi topic berhasil dikirim');
  } catch (topicError) {
    console.error('[LAPORAN][FCM-TOPIC] Error:', topicError.message);
  }

  // Kirim ke semua token terdaftar (untuk device offline)
  try {
    const fcmResult = await sendFcmToAllTokens(
      'Peringatan Dini Banjir',
      'Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.',
      { type: 'laporan' }
    );
    console.log(`[LAPORAN][FCM-TOKENS] Sent: ${fcmResult.success}, Failed: ${fcmResult.fail}`);
  } catch (tokenError) {
    console.error('[LAPORAN][FCM-TOKENS] Error:', tokenError.message);
  }
  
  // Kirim WhatsApp ke semua user
  await kirimWhatsappKeSemuaUser('Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.');
}

// Fungsi untuk pengecekan dan pengiriman via cron
async function cekDanKirimNotifikasiTigaLaporanValid() {
  // Hitung jumlah laporan valid hari ini
  const result = await pool.query(
    `SELECT COUNT(*) as total
     FROM sigab_app.laporan
     WHERE tipe_laporan = 'Banjir'
     AND status = 'Valid'
     AND DATE(waktu) = CURRENT_DATE`
  );
  const totalValid = parseInt(result.rows[0].total);

  // Cek apakah notifikasi sudah pernah dikirim hari ini
  const notif = await pool.query(
    `SELECT 1 FROM sigab_app.notifikasi
     WHERE judul = $1
     AND DATE(created_at) = CURRENT_DATE
     LIMIT 1`,
    ['Peringatan Dini Banjir']
  );

  if (totalValid >= 3 && notif.rows.length === 0) {
    await kirimNotifikasiTigaLaporanValid();
    console.log('[CRON][LAPORAN] Notifikasi 3 laporan valid dikirim.');
  } else {
    console.log('[CRON][LAPORAN] Belum memenuhi syarat atau sudah dikirim.');
  }
}

module.exports = { kirimNotifikasiTigaLaporanValid, cekDanKirimNotifikasiTigaLaporanValid }; 