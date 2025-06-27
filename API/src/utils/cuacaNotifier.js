const pool = require('../config/database');
const { sendFcmTopicNotification } = require('./fcm');
const axios = require('axios');
const isDemo = process.env.DEMO_MODE === 'true';

// Fungsi untuk kirim notifikasi peringatan dini cuaca berdasarkan response BMKG
async function kirimNotifikasiCuaca() {
  console.log('[CUACA][CRON] Memulai pengecekan notifikasi cuaca...');
  let data;
  if (isDemo) {
    // Data mock: selalu ada hujan 1 jam dari sekarang
    const now = new Date();
    const mockForecast = {
      weather_desc: 'Hujan Lebat',
      local_datetime: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
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

  // Format jam dari local_datetime
  const jam = new Date(hujanForecast.local_datetime.replace(' ', 'T')).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  const cuaca = hujanForecast.weather_desc;
  const deskripsi = `Peringatan dini: ${cuaca} diperkirakan terjadi pada pukul ${jam}.`;

  // Cek duplikasi hanya untuk hari ini
  const cek = await pool.query(
    `SELECT 1 FROM sigab_app.notifikasi 
     WHERE judul = $1 
       AND pesan = $2 
       AND DATE(created_at) = CURRENT_DATE
     LIMIT 1`,
    ['Peringatan Dini Cuaca', deskripsi]
  );
  if (cek.rows.length > 0) {
    console.log('[CUACA][CRON] Notifikasi cuaca ini sudah pernah dikirim hari ini, skip.');
    return;
  }

  console.log('[CUACA][FCM] Akan mengirim notifikasi ke topic: peringatan-cuaca', 'Peringatan Dini Cuaca', deskripsi);
  await sendFcmTopicNotification(
    'peringatan-cuaca',
    'Peringatan Dini Cuaca',
    deskripsi,
    { jam, cuaca }
  );
  console.log('[CUACA][FCM] Selesai kirim notifikasi ke topic: peringatan-cuaca');

  await pool.query(
    'INSERT INTO sigab_app.notifikasi (judul, pesan, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT DO NOTHING',
    ['Peringatan Dini Cuaca', deskripsi]
  );
  console.log('[CUACA][DB] Notifikasi berhasil disimpan ke database');
}

module.exports = { kirimNotifikasiCuaca }; 