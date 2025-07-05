const pool = require('../config/database');
const { sendFcmSmartCollapsible } = require('./fcm');
const axios = require('axios');
const isDemo = true;
const { kirimWhatsappKeSemuaUser } = require('./twilioNotifier');
const logger = require('./logger');

// Global lock untuk mencegah multiple execution
let isProcessing = false;

// Fungsi untuk kirim notifikasi peringatan dini cuaca berdasarkan response BMKG
async function kirimNotifikasiCuaca() {
  // AGGRESIVE DEDUPLICATION - Global lock untuk mencegah multiple execution
  if (isProcessing) {
    logger.info('[CUACA][CRON] AGGRESIVE LOCK: Another process is already running, skipping...');
    return;
  }
  
  isProcessing = true;
  
  try {
    logger.info('[DEBUG] Masuk ke fungsi kirimNotifikasiCuaca');
    logger.info('[CUACA][CRON] Memulai pengecekan notifikasi cuaca...');
  
  // Log isi tabel notifikasi hari ini sebelum pengecekan (WIB)
  const allNotif = await pool.query("SELECT * FROM sigab_app.notifikasi WHERE created_at >= (NOW() AT TIME ZONE 'Asia/Jakarta')::date");
  logger.info('[DEBUG] Isi tabel notifikasi hari ini (WIB):', JSON.stringify(allNotif.rows));
  
  // Cek apakah sudah ada notifikasi cuaca hari ini
  const existingNotification = await pool.query(
    `SELECT 1 FROM sigab_app.notifikasi 
     WHERE judul = 'Peringatan Dini Cuaca'
     AND created_at >= (NOW() AT TIME ZONE 'Asia/Jakarta')::date
     LIMIT 1`
  );
  
  if (existingNotification.rows.length > 0) {
    logger.info('[CUACA][CRON] Notifikasi cuaca sudah pernah dikirim hari ini, skip.');
    return;
  }
  
  let data;
  if (isDemo) {
    // Ambil data asli dari BMKG
    const response = await axios.get('https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.04.12.2006');
    data = response.data;
    // Ubah semua weather_desc menjadi 'Hujan Lebat' (jam tetap dari BMKG)
    if (data && Array.isArray(data.data)) {
      for (const lokasi of data.data) {
        if (lokasi.cuaca && Array.isArray(lokasi.cuaca)) {
          for (const period of lokasi.cuaca) {
            if (Array.isArray(period)) {
              for (const forecast of period) {
                if (forecast && typeof forecast === 'object') {
                  forecast.weather_desc = 'Hujan Lebat';
                }
              }
            }
          }
        }
      }
    }
    logger.info('[DEMO MODE] Menggunakan data BMKG asli, cuaca diubah menjadi Hujan Lebat: ' + JSON.stringify(data));
  } else {
    // Data asli dari BMKG
    const response = await axios.get('https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.04.12.2006');
    data = response.data;
  }

  // Cek struktur data
  if (!data || !Array.isArray(data.data) || data.data.length === 0) {
    logger.info('[CUACA][CRON] Tidak ada data cuaca tersedia');
    return;
  }
  const lokasiData = data.data[0];
  if (!lokasiData.cuaca || !Array.isArray(lokasiData.cuaca)) {
    logger.info('[CUACA][CRON] Struktur data cuaca tidak valid');
    return;
  }

  // Flatten array cuaca (karena nested array)
  const allForecasts = lokasiData.cuaca.flat();

  // Log seluruh data BMKG yang diterima
  logger.info('[WEATHER] Data BMKG:', JSON.stringify(data));
  // Log semua forecast hari ini
  logger.info('[WEATHER] Forecasts for today:');
  for (const forecast of allForecasts) {
    logger.info(
      `desc=${forecast.weather_desc}, code=${forecast.weather}, local_datetime=${forecast.local_datetime}`
    );
  }

  const now = new Date();
  const nowWIB = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  logger.info('[WEATHER] nowWIB: ' + nowWIB.toISOString());

  // Kumpulkan semua forecast hujan yang waktunya > 30 menit dari sekarang
  let hujanForecasts = [];
  for (const forecast of allForecasts) {
    if (!forecast.weather_desc || !forecast.local_datetime) continue;
    if (forecast.weather_desc.toLowerCase().includes('hujan')) {
      const forecastTime = new Date(forecast.local_datetime.replace(' ', 'T'));
      const diffMinutes = (forecastTime - nowWIB) / (1000 * 60);
      if (diffMinutes < 30) continue;
      hujanForecasts.push({ forecast, diffMinutes });
    }
  }

  // Log semua forecast hujan yang lolos filter
  logger.info('[DEBUG] Semua forecast hujan yang lolos filter (>30 menit dari sekarang):');
  hujanForecasts.forEach(({ forecast, diffMinutes }) => {
    logger.info(`local_datetime=${forecast.local_datetime}, diffMinutes=${diffMinutes}, weather_desc=${forecast.weather_desc}`);
  });

  // Pilih forecast dengan waktu terdekat
  let hujanForecast = null;
  if (hujanForecasts.length > 0) {
    hujanForecasts.sort((a, b) => a.diffMinutes - b.diffMinutes);
    hujanForecast = hujanForecasts[0].forecast;
  }

  if (!hujanForecast) {
    logger.info('[CUACA][CRON] Tidak ada hujan terdekat, notifikasi tidak dikirim.');
    return;
  }

  // Ambil jam langsung dari string local_datetime BMKG
  const jam = hujanForecast.local_datetime.split(' ')[1].slice(0, 5); // 'HH:mm'
  const cuaca = hujanForecast.weather_desc;
  const deskripsi = `Peringatan dini: ${cuaca} diperkirakan terjadi pada pukul ${jam} WIB.`;
  
  // Generate unique notification ID untuk deduplikasi
  const notificationId = Date.now().toString();

  // AGGRESIVE DEDUPLICATION - Database level
  const notifCheck = await pool.query(
    `SELECT 1 FROM sigab_app.notifikasi 
     WHERE judul = 'Peringatan Dini Cuaca'
     AND created_at >= NOW() - INTERVAL '4 hours'
     LIMIT 1`,
    []
  );
  if (notifCheck.rows.length > 0) {
    logger.info('[CUACA][CRON] AGGRESIVE DEDUP: Notifikasi cuaca sudah pernah dikirim dalam 4 jam terakhir, skip.');
    return;
  }
  
  // AGGRESIVE DEDUPLICATION - Rate limiting per jam
  const hourlyCheck = await pool.query(
    `SELECT COUNT(*) as count FROM sigab_app.notifikasi 
     WHERE judul = 'Peringatan Dini Cuaca'
     AND created_at >= NOW() - INTERVAL '1 hour'`,
    []
  );
  const hourlyCount = parseInt(hourlyCheck.rows[0].count);
  if (hourlyCount >= 1) {
    logger.info(`[CUACA][CRON] AGGRESIVE RATE LIMIT: Sudah ada ${hourlyCount} notifikasi cuaca dalam 1 jam terakhir, skip.`);
    return;
  }

  // AGGRESIVE DEDUPLICATION - Add random delay untuk mencegah race condition
  const randomDelay = Math.floor(Math.random() * 5000) + 1000; // 1-6 detik delay
  logger.info(`[CUACA][CRON] Adding random delay: ${randomDelay}ms to prevent race conditions`);
  await new Promise(resolve => setTimeout(resolve, randomDelay));
  
  // Double check setelah delay
  const finalCheck = await pool.query(
    `SELECT 1 FROM sigab_app.notifikasi 
     WHERE judul = 'Peringatan Dini Cuaca'
     AND created_at >= NOW() - INTERVAL '1 hour'
     LIMIT 1`,
    []
  );
  if (finalCheck.rows.length > 0) {
    logger.info('[CUACA][CRON] FINAL CHECK: Notifikasi cuaca sudah dikirim dalam 1 jam terakhir setelah delay, skip.');
    return;
  }

  // Simpan ke tabel notifikasi
  await pool.query(
    'INSERT INTO sigab_app.notifikasi (judul, pesan, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
    ['Peringatan Dini Cuaca', deskripsi]
  );
  logger.info('[CUACA][DB] Notifikasi berhasil disimpan ke database');

  // Kirim dengan smart collapsible (TTL 7 hari, tanpa database tambahan)
  try {
    const fcmResult = await sendFcmSmartCollapsible(
      'Peringatan Dini Cuaca',
      deskripsi,
      { 
        jam, 
        cuaca, 
        type: 'cuaca',
        source: 'cron_job',
        notification_id: notificationId,
        timestamp: new Date().toISOString(),
        dedup_key: `cuaca_${Math.floor(Date.now() / (60 * 60 * 1000))}`, // Additional dedup key
        ttl: 7 * 24 * 60 * 60 // 7 days in seconds
      }
    );
    logger.info(`[CUACA][FCM SMART COLLAPSIBLE] Topic: ${fcmResult.topicSuccess ? 'SUCCESS' : 'FAILED'}, Individual: ${fcmResult.individualSuccess} sent, ${fcmResult.individualFailed} failed, Invalid removed: ${fcmResult.invalidTokens?.length || 0}, TTL: 7 days, Notification ID: ${notificationId}, Dedup Key: cuaca_${Math.floor(Date.now() / (60 * 60 * 1000))}`);
  } catch (fcmError) {
    logger.error('[CUACA][FCM SMART COLLAPSIBLE] Error:', fcmError.message);
  }

  // Kirim WhatsApp ke semua user
  await kirimWhatsappKeSemuaUser(deskripsi);
  
  } catch (error) {
    logger.error('[CUACA][CRON] Error during notification process:', error.message);
  } finally {
    // Release lock
    isProcessing = false;
    logger.info('[CUACA][CRON] Process completed, lock released');
  }
}

module.exports = { kirimNotifikasiCuaca }; 