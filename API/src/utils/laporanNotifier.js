const pool = require('../config/database');
const { sendFcmToAllTokens } = require('./fcm');
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
      'Peringatan Laporan Banjir',
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
      'Peringatan Laporan Banjir',
      'Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.'
    ]
  );
  
  // Kirim ke semua token terdaftar (untuk device online dan offline)
  try {
    const fcmResult = await sendFcmToAllTokens(
      'Peringatan Laporan Banjir',
      'Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.',
      { 
        type: 'laporan',
        notification_id: Date.now().toString(),
        timestamp: new Date().toISOString()
      }
    );
    console.log(`[LAPORAN][FCM] Sent: ${fcmResult.success}, Failed: ${fcmResult.fail}, Invalid removed: ${fcmResult.invalidTokens?.length || 0}`);
  } catch (tokenError) {
    console.error('[LAPORAN][FCM] Error:', tokenError.message);
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
    ['Peringatan Laporan Banjir']
  );

  if (totalValid >= 3 && notif.rows.length === 0) {
    await kirimNotifikasiTigaLaporanValid();
    console.log('[CRON][LAPORAN] Notifikasi 3 laporan valid dikirim.');
  } else {
    console.log('[CRON][LAPORAN] Belum memenuhi syarat atau sudah dikirim.');
  }
}

module.exports = { kirimNotifikasiTigaLaporanValid, cekDanKirimNotifikasiTigaLaporanValid }; 