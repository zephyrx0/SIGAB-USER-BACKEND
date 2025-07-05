const pool = require('../config/database');
const { sendFcmSmartCollapsible } = require('./fcm');
const { kirimWhatsappKeSemuaUser } = require('./twilioNotifier');

// Global lock untuk mencegah multiple execution
let isProcessing = false;

async function kirimNotifikasiTigaLaporanValid() {
  // AGGRESIVE DEDUPLICATION - Global lock untuk mencegah multiple execution
  if (isProcessing) {
    console.log('[LAPORAN][CRON] AGGRESIVE LOCK: Another process is already running, skipping...');
    return;
  }
  
  isProcessing = true;
  
  try {
    // Generate unique notification ID untuk deduplikasi
    const notificationId = Date.now().toString();

    // AGGRESIVE DEDUPLICATION - Database level
    const notifCheck = await pool.query(
      `SELECT 1 FROM sigab_app.notifikasi 
       WHERE judul = 'Peringatan Laporan Banjir'
       AND created_at >= NOW() - INTERVAL '4 hours'
       LIMIT 1`,
      []
    );
    if (notifCheck.rows.length > 0) {
      console.log('[LAPORAN][CRON] AGGRESIVE DEDUP: Notifikasi laporan sudah pernah dikirim dalam 4 jam terakhir, skip.');
      return;
    }
    
    // AGGRESIVE DEDUPLICATION - Rate limiting per jam
    const hourlyCheck = await pool.query(
      `SELECT COUNT(*) as count FROM sigab_app.notifikasi 
       WHERE judul = 'Peringatan Laporan Banjir'
       AND created_at >= NOW() - INTERVAL '1 hour'`,
      []
    );
    const hourlyCount = parseInt(hourlyCheck.rows[0].count);
    if (hourlyCount >= 1) {
      console.log(`[LAPORAN][CRON] AGGRESIVE RATE LIMIT: Sudah ada ${hourlyCount} notifikasi laporan dalam 1 jam terakhir, skip.`);
      return;
    }
  
    // AGGRESIVE DEDUPLICATION - Add random delay untuk mencegah race condition
    const randomDelay = Math.floor(Math.random() * 5000) + 1000; // 1-6 detik delay
    console.log(`[LAPORAN][CRON] Adding random delay: ${randomDelay}ms to prevent race conditions`);
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    
    // Double check setelah delay
    const finalCheck = await pool.query(
      `SELECT 1 FROM sigab_app.notifikasi 
       WHERE judul = 'Peringatan Laporan Banjir'
       AND created_at >= NOW() - INTERVAL '1 hour'
       LIMIT 1`,
      []
    );
    if (finalCheck.rows.length > 0) {
      console.log('[LAPORAN][CRON] FINAL CHECK: Notifikasi laporan sudah dikirim dalam 1 jam terakhir setelah delay, skip.');
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
    
    // Kirim dengan smart collapsible (TTL 7 hari, tanpa database tambahan)
    try {
      const fcmResult = await sendFcmSmartCollapsible(
        'Peringatan Laporan Banjir',
        'Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.',
        { 
          type: 'laporan',
          source: 'cron_job',
          notification_id: notificationId,
          timestamp: new Date().toISOString(),
          dedup_key: `laporan_${Math.floor(Date.now() / (60 * 60 * 1000))}`, // Additional dedup key
          ttl: 7 * 24 * 60 * 60 // 7 days in seconds
        }
      );
      console.log(`[LAPORAN][FCM SMART COLLAPSIBLE] Topic: ${fcmResult.topicSuccess ? 'SUCCESS' : 'FAILED'}, Individual: ${fcmResult.individualSuccess} sent, ${fcmResult.individualFailed} failed, Invalid removed: ${fcmResult.invalidTokens?.length || 0}, TTL: 7 days, Notification ID: ${notificationId}, Dedup Key: laporan_${Math.floor(Date.now() / (60 * 60 * 1000))}`);
    } catch (fcmError) {
      console.error('[LAPORAN][FCM SMART COLLAPSIBLE] Error:', fcmError.message);
    }
    
    // Kirim WhatsApp ke semua user
    await kirimWhatsappKeSemuaUser('Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.');
    
  } catch (error) {
    console.error('[LAPORAN][CRON][ERROR]', error.message);
  } finally {
    // Release lock
    isProcessing = false;
    console.log('[LAPORAN][CRON] Process completed, lock released');
  }
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