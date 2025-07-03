const pool = require('../config/database');
const { sendFcmSmartCollapsible } = require('./fcm');
const axios = require('axios');
const isDemo = true;
const { kirimWhatsappKeSemuaUser } = require('./twilioNotifier');
const logger = require('./logger');

// Fungsi untuk kirim notifikasi peringatan dini cuaca berdasarkan response BMKG
async function kirimNotifikasiCuaca() {
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
    // Data mock: selalu ada hujan 1 jam dari sekarang
    const now = new Date();
    // Konversi ke WIB (UTC+7)
    const wib = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    // Format ke string ISO dengan offset +07:00
    const localDatetime = wib.toISOString().replace('Z', '+07:00');
    const mockForecast = {
      weather_desc: 'Hujan Lebat',
      local_datetime: localDatetime
    };
    data = { data: [{ cuaca: [[mockForecast]] }] };
    logger.info('[DEMO MODE] Menggunakan data cuaca mock: ' + JSON.stringify(data));
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

  // Cari forecast terdekat yang weather_desc mengandung 'hujan'
  const now = new Date();
  const nowWIB = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  logger.info('[WEATHER] nowWIB: ' + nowWIB.toISOString());
  let hujanForecast = null;
  for (const forecast of allForecasts) {
    if (!forecast.weather_desc || !forecast.local_datetime) continue;
    if (forecast.weather_desc.toLowerCase().includes('hujan')) {
      // Ambil forecast hujan terdekat setelah waktu sekarang
      const forecastTime = new Date(forecast.local_datetime.replace(' ', 'T'));
      // Filter: hanya forecast > 30 menit dari sekarang WIB
      const diffMinutes = (forecastTime - nowWIB) / (1000 * 60);
      if (diffMinutes < 30) continue;
      logger.info('[WEATHER] Akan mengirim notifikasi untuk forecast: ' + JSON.stringify(forecast));
      hujanForecast = forecast;
      break;
    }
  }

  if (!hujanForecast) {
    logger.info('[CUACA][CRON] Tidak ada hujan terdekat, notifikasi tidak dikirim.');
    return;
  }

  // Format jam dari local_datetime dengan zona waktu yang benar
  const forecastTime = new Date(hujanForecast.local_datetime.replace(' ', 'T'));
  // Tambahkan 7 jam untuk UTC+7 (WIB)
  const wibTime = new Date(forecastTime.getTime() + (7 * 60 * 60 * 1000));
  const jam = wibTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  const cuaca = hujanForecast.weather_desc;
  const deskripsi = `Peringatan dini: ${cuaca} diperkirakan terjadi pada pukul ${jam} WIB.`;

  // Cek manual sebelum insert
  const notifCheck = await pool.query(
    `SELECT 1 FROM sigab_app.notifikasi 
     WHERE judul = 'Peringatan Dini Cuaca'
     AND pesan = $1
     AND created_at >= (NOW() AT TIME ZONE 'Asia/Jakarta')::date
     LIMIT 1`,
    [deskripsi]
  );
  if (notifCheck.rows.length > 0) {
    logger.info('[CUACA][CRON] Notifikasi cuaca sudah pernah dikirim hari ini, skip.');
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
        source: 'cron_job'
      }
    );
    logger.info(`[CUACA][FCM SMART COLLAPSIBLE] Topic: ${fcmResult.topicSuccess ? 'SUCCESS' : 'FAILED'}, Individual: ${fcmResult.individualSuccess} sent, ${fcmResult.individualFailed} failed, Invalid removed: ${fcmResult.invalidTokens?.length || 0}, TTL: 7 days`);
  } catch (fcmError) {
    logger.error('[CUACA][FCM SMART COLLAPSIBLE] Error:', fcmError.message);
  }

  // Kirim WhatsApp ke semua user
  await kirimWhatsappKeSemuaUser(deskripsi);
}

module.exports = { kirimNotifikasiCuaca }; 