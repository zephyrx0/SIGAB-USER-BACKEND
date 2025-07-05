const pool = require('../config/database');
const { sendFcmSmartCollapsible } = require('./fcm');
const { kirimWhatsappKeSemuaUser } = require('./twilioNotifier');

// Global lock untuk mencegah multiple execution
let isProcessing = false;

async function kirimNotifikasiBanjirTerbaru() {
  // AGGRESIVE DEDUPLICATION - Global lock untuk mencegah multiple execution
  if (isProcessing) {
    console.log('[BANJIR][CRON] AGGRESIVE LOCK: Another process is already running, skipping...');
    return;
  }
  
  isProcessing = true;
  
  try {
    console.log('[BANJIR][CRON] Memulai pengecekan notifikasi banjir...');
    
    const result = await pool.query(
      'SELECT wilayah_banjir FROM sigab_app.informasi_banjir ORDER BY waktu_kejadian DESC LIMIT 1'
    );
    if (result.rows.length === 0) {
      console.log('[BANJIR][CRON] Tidak ada data banjir tersedia');
      return;
    }
    const { wilayah_banjir } = result.rows[0];
    const deskripsi = `Banjir terdeteksi di wilayah ${wilayah_banjir}, Mohon waspada`;

    // Generate unique notification ID untuk deduplikasi
    const notificationId = Date.now().toString();

    // AGGRESIVE DEDUPLICATION - Database level
    const notifCheck = await pool.query(
      `SELECT 1 FROM sigab_app.notifikasi 
       WHERE judul = 'Informasi Banjir Terbaru'
       AND created_at >= NOW() - INTERVAL '4 hours'
       LIMIT 1`,
      []
    );
    if (notifCheck.rows.length > 0) {
      console.log('[BANJIR][CRON] AGGRESIVE DEDUP: Notifikasi banjir sudah pernah dikirim dalam 4 jam terakhir, skip.');
      return;
    }
    
    // AGGRESIVE DEDUPLICATION - Rate limiting per jam
    const hourlyCheck = await pool.query(
      `SELECT COUNT(*) as count FROM sigab_app.notifikasi 
       WHERE judul = 'Informasi Banjir Terbaru'
       AND created_at >= NOW() - INTERVAL '1 hour'`,
      []
    );
    const hourlyCount = parseInt(hourlyCheck.rows[0].count);
    if (hourlyCount >= 1) {
      console.log(`[BANJIR][CRON] AGGRESIVE RATE LIMIT: Sudah ada ${hourlyCount} notifikasi banjir dalam 1 jam terakhir, skip.`);
      return;
    }

    // AGGRESIVE DEDUPLICATION - Add random delay untuk mencegah race condition
    const randomDelay = Math.floor(Math.random() * 5000) + 1000; // 1-6 detik delay
    console.log(`[BANJIR][CRON] Adding random delay: ${randomDelay}ms to prevent race conditions`);
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    
    // Double check setelah delay
    const finalCheck = await pool.query(
      `SELECT 1 FROM sigab_app.notifikasi 
       WHERE judul = 'Informasi Banjir Terbaru'
       AND created_at >= NOW() - INTERVAL '1 hour'
       LIMIT 1`,
      []
    );
    if (finalCheck.rows.length > 0) {
      console.log('[BANJIR][CRON] FINAL CHECK: Notifikasi banjir sudah dikirim dalam 1 jam terakhir setelah delay, skip.');
      return;
    }

    // Simpan ke tabel notifikasi
    await pool.query(
      'INSERT INTO sigab_app.notifikasi (judul, pesan, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
      ['Informasi Banjir Terbaru', deskripsi]
    );
    console.log('[BANJIR][DB] Notifikasi berhasil disimpan ke database');

    // Kirim dengan smart collapsible (TTL 7 hari, tanpa database tambahan)
    try {
      const fcmResult = await sendFcmSmartCollapsible(
        'Informasi Banjir Terbaru',
        deskripsi,
        { 
          wilayah_banjir, 
          type: 'banjir',
          source: 'cron_job',
          notification_id: notificationId,
          timestamp: new Date().toISOString(),
          dedup_key: `banjir_${Math.floor(Date.now() / (60 * 60 * 1000))}`, // Additional dedup key
          ttl: 7 * 24 * 60 * 60 // 7 days in seconds
        }
      );
      console.log(`[BANJIR][FCM SMART COLLAPSIBLE] Topic: ${fcmResult.topicSuccess ? 'SUCCESS' : 'FAILED'}, Individual: ${fcmResult.individualSuccess} sent, ${fcmResult.individualFailed} failed, Invalid removed: ${fcmResult.invalidTokens?.length || 0}, TTL: 7 days, Notification ID: ${notificationId}, Dedup Key: banjir_${Math.floor(Date.now() / (60 * 60 * 1000))}`);
    } catch (fcmError) {
      console.error('[BANJIR][FCM SMART COLLAPSIBLE] Error:', fcmError.message);
    }

    // Kirim WhatsApp ke semua user
    await kirimWhatsappKeSemuaUser(deskripsi);
    
  } catch (error) {
    console.error('[BANJIR][CRON][ERROR]', error.message);
  } finally {
    // Release lock
    isProcessing = false;
    console.log('[BANJIR][CRON] Process completed, lock released');
  }
}

module.exports = { kirimNotifikasiBanjirTerbaru };