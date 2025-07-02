const pool = require('../config/database');
const { sendFcmSmartCollapsible } = require('./fcm');
const axios = require('axios');
const isDemo = process.env.DEMO_MODE === 'true';
const { kirimWhatsappKeSemuaUser } = require('./twilioNotifier');

// Fungsi untuk kirim notifikasi peringatan dini cuaca berdasarkan response BMKG
async function kirimNotifikasiCuaca() {
  console.log('[CUACA][CRON] Memulai pengecekan notifikasi cuaca...');
  
  // Cek apakah sudah ada notifikasi cuaca hari ini
  const existingNotification = await pool.query(
    `SELECT 1 FROM sigab_app.notifikasi 
     WHERE judul = 'Peringatan Dini Cuaca'
     AND DATE(created_at) = CURRENT_DATE
     LIMIT 1`
  );
  
  if (existingNotification.rows.length > 0) {
    console.log('[CUACA][CRON] Notifikasi cuaca sudah pernah dikirim hari ini, skip.');
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
    console.log('[DEMO MODE] Menggunakan data cuaca mock:', data);
  } else {
    // Data asli dari BMKG
    const response = await axios.get('https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.04.12.2006');
    data = response.data;
  }

  // Cek struktur data
  if (!data || !Array.isArray(data.data) || data.data.length === 0) {
    console.log('[CUACA][CRON] Tidak ada data cuaca tersedia');
    return;
  }
  const lokasiData = data.data[0];
  if (!lokasiData.cuaca || !Array.isArray(lokasiData.cuaca)) {
    console.log('[CUACA][CRON] Struktur data cuaca tidak valid');
    return;
  }

  // Flatten array cuaca (karena nested array)
  const allForecasts = lokasiData.cuaca.flat();

  // Cari forecast terdekat yang weather_desc mengandung 'hujan'
  const now = new Date();
  let hujanForecast = null;
  for (const forecast of allForecasts) {
    if (!forecast.weather_desc || !forecast.local_datetime) continue;
    if (forecast.weather_desc.toLowerCase().includes('hujan')) {
      // Ambil forecast hujan terdekat setelah waktu sekarang
      const forecastTime = new Date(forecast.local_datetime.replace(' ', 'T'));
      if (forecastTime > now) {
        hujanForecast = forecast;
        break;
      }
    }
  }

  if (!hujanForecast) {
    console.log('[CUACA][CRON] Tidak ada hujan terdekat, notifikasi tidak dikirim.');
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
     AND DATE(created_at) = CURRENT_DATE
     LIMIT 1`,
    [deskripsi]
  );
  if (notifCheck.rows.length > 0) {
    console.log('[CUACA][CRON] Notifikasi cuaca sudah pernah dikirim hari ini, skip.');
    return;
  }

  // Simpan ke tabel notifikasi
  await pool.query(
    'INSERT INTO sigab_app.notifikasi (judul, pesan, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
    ['Peringatan Dini Cuaca', deskripsi]
  );
  console.log('[CUACA][DB] Notifikasi berhasil disimpan ke database');

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
    console.log(`[CUACA][FCM SMART COLLAPSIBLE] Topic: ${fcmResult.topicSuccess ? 'SUCCESS' : 'FAILED'}, Individual: ${fcmResult.individualSuccess} sent, ${fcmResult.individualFailed} failed, Invalid removed: ${fcmResult.invalidTokens?.length || 0}, TTL: 7 days`);
  } catch (fcmError) {
    console.error('[CUACA][FCM SMART COLLAPSIBLE] Error:', fcmError.message);
  }

  // Kirim WhatsApp ke semua user
  await kirimWhatsappKeSemuaUser(deskripsi);
}

module.exports = { kirimNotifikasiCuaca }; 