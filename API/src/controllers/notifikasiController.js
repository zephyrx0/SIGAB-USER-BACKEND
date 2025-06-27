const pool = require('../config/database');
const axios = require('axios');
const { sendFcmNotification } = require('../utils/fcm');

// Fungsi untuk mendapatkan semua notifikasi
exports.getAllNotifications = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sigab_app."notifikasi" ORDER BY created_at DESC');
    res.status(200).json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error while fetching notifications:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengambil data notifikasi'
    });
  }
};

// Fungsi untuk mengecek jumlah laporan banjir valid dalam satu hari
exports.checkFloodReports = async (req, res) => {
  try {
    // Menggunakan CURRENT_DATE dari database untuk menghindari isu zona waktu server
    // const today = new Date();
    // today.setHours(0, 0, 0, 0);
    // const todayStr = today.toISOString().slice(0, 10); // 'YYYY-MM-DD'

    // console.log('DEBUG: todayStr used in query:', todayStr);

    const result = await pool.query(
      `SELECT COUNT(*) as total
       FROM sigab_app.laporan
       WHERE tipe_laporan = 'Banjir'
       AND status = 'Valid'
       AND DATE(waktu) = CURRENT_DATE` // Menggunakan CURRENT_DATE dari DB
    );

    console.log('DEBUG: Query result from DB:', result.rows);

    const totalValidReports = parseInt(result.rows[0].total);

    res.status(200).json({
      status: 'success',
      data: {
        total_valid_reports: totalValidReports,
        should_notify: totalValidReports >= 3
      }
    });
  } catch (error) {
    console.error('Error while checking flood reports:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengecek laporan banjir'
    });
  }
};

// Fungsi untuk mendapatkan riwayat notifikasi
exports.getNotificationHistory = async (req, res) => {
  try {
    // Mengambil tanggal instalasi (timestamp penuh) dari query parameter
    const { installed_at } = req.query;
    
    if (!installed_at) {
      return res.status(400).json({
        status: 'error',
        message: 'Timestamp instalasi aplikasi diperlukan'
      });
    }

    // Query untuk mendapatkan notifikasi yang dibuat setelah timestamp instalasi
    const result = await pool.query(
      `SELECT *
       FROM sigab_app.notifikasi
       WHERE created_at >= $1::timestamp with time zone
       ORDER BY created_at DESC
       LIMIT 50`,
      [installed_at]
    );

    res.status(200).json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error while fetching notification history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengambil riwayat notifikasi'
    });
  }
};

// Fungsi untuk mengecek peringatan cuaca (hujan hari ini)
exports.checkWeatherWarning = async (req, res) => {
  try {
    console.log('[WEATHER] Memulai pengecekan peringatan cuaca...');
    // Ambil data cuaca dari BMKG
    const response = await axios.get('https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.04.12.2006');
    console.log('[WEATHER] Data BMKG diterima:', JSON.stringify(response.data).slice(0, 500)); // log sebagian data
    let cuacaList = [];
    if (Array.isArray(response.data)) {
      cuacaList = response.data;
      console.log('[WEATHER] Struktur data: Array root, length:', cuacaList.length);
    } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
      cuacaList = response.data.data;
      console.log('[WEATHER] Struktur data: Object root, data array length:', cuacaList.length);
    }
    if (!cuacaList.length) {
      console.log('[WEATHER] Tidak ada data cuaca tersedia.');
      return res.status(200).json({
        status: 'success',
        should_notify: false,
        message: 'Data cuaca tidak tersedia saat ini.'
      });
    }
    // Cari forecast untuk hari ini berdasarkan local_datetime (bandingkan tanggal lokal, UTC+7)
    const today = new Date();
    const todayLocal = new Date(today.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
    const todayStr = todayLocal.toISOString().split('T')[0];
    let todayForecasts = [];
    for (const lokasi of cuacaList) {
      if (!lokasi.cuaca || !Array.isArray(lokasi.cuaca)) continue;
      for (const period of lokasi.cuaca) {
        if (!Array.isArray(period)) continue;
        for (const forecast of period) {
          if (!forecast.local_datetime) continue;
          // Ambil hanya tanggal (YYYY-MM-DD) dari local_datetime
          const localDateStr = forecast.local_datetime.split(' ')[0] || forecast.local_datetime.split('T')[0];
          console.log('[WEATHER] local_datetime:', forecast.local_datetime, '->', localDateStr, 'vs todayStr:', todayStr);
          if (localDateStr === todayStr) {
            todayForecasts.push(forecast);
          }
        }
      }
    }
    if (!todayForecasts.length) {
      console.log('[WEATHER] Data cuaca hari ini belum tersedia.');
      return res.status(200).json({
        status: 'success',
        should_notify: false,
        message: 'Data cuaca hari ini belum tersedia.'
      });
    }

    // --- Notifikasi cuaca cerah ---
    let cerahFound = false;
    let cerahTime = null;
    for (const forecast of todayForecasts) {
      if (!forecast.weather_desc || !forecast.local_datetime) continue;
      const weatherDesc = forecast.weather_desc.toLowerCase();
      const localTime = new Date(forecast.local_datetime);
      const diffHours = (localTime - today) / (1000 * 60 * 60);
      console.log(`[WEATHER] Cek forecast: desc=${weatherDesc}, waktu=${forecast.local_datetime}, diffHours=${diffHours}`);
      if (diffHours >= 0 && diffHours <= 24 && weatherDesc.includes('cerah')) {
        cerahFound = true;
        cerahTime = localTime;
        console.log('[WEATHER] Cerah ditemukan pada:', cerahTime);
        break;
      }
    }
    if (cerahFound && cerahTime) {
      const timeFormat = cerahTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
      const msg = `Peringatan: Diperkirakan cuaca cerah hari ini pada pukul ${timeFormat}. Tetap waspada terhadap panas berlebih!`;
      console.log('[WEATHER] Mengirim notifikasi cuaca cerah:', msg);
      return res.status(200).json({
        status: 'success',
        should_notify: true,
        message: msg
      });
    }
    // --- Akhir notifikasi cuaca cerah ---

    /*
    // --- Notifikasi cuaca hujan (kode lama, dikomentari) ---
    // Analisis kondisi cuaca
    let shouldNotify = false;
    let warningMessage = '';
    let consecutiveRainHours = 0;
    let rainStartTime = null;
    let rainType = null;
    let lastRainTime = null;
    let maxRainIntensity = 0;
    for (const forecast of todayForecast.cuaca) {
      if (!forecast.weather_desc || !forecast.local_datetime) continue;
      const weatherDesc = forecast.weather_desc.toLowerCase();
      const localTime = new Date(forecast.local_datetime);
      let rainIntensity = 0;
      if (weatherDesc.includes('hujan ringan')) rainIntensity = 1;
      else if (weatherDesc.includes('hujan sedang')) rainIntensity = 2;
      else if (weatherDesc.includes('hujan lebat')) rainIntensity = 3;
      else if (weatherDesc.includes('hujan sangat lebat')) rainIntensity = 4;
      if (rainIntensity > 0) {
        if (rainStartTime === null) {
          rainStartTime = localTime;
          rainType = weatherDesc;
        }
        lastRainTime = localTime;
        consecutiveRainHours++;
        maxRainIntensity = Math.max(maxRainIntensity, rainIntensity);
      } else {
        rainStartTime = null;
        consecutiveRainHours = 0;
        lastRainTime = null;
        maxRainIntensity = 0;
      }
    }
    if (consecutiveRainHours >= 3 && rainStartTime && lastRainTime) {
      shouldNotify = true;
      const timeFormat = new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const startTime = timeFormat.format(rainStartTime);
      const endTime = timeFormat.format(lastRainTime);
      let intensityWarning = '';
      if (maxRainIntensity >= 3) {
        intensityWarning = 'Waspadai potensi banjir! ';
      } else if (maxRainIntensity >= 2) {
        intensityWarning = 'Perhatikan genangan air! ';
      }
      warningMessage = `${intensityWarning}Peringatan: ${rainType} diperkirakan terjadi selama ${consecutiveRainHours} jam dari pukul ${startTime} hingga ${endTime} WIB. Lakukan mitigasi banjir.`;
    } else if (todayForecast.cuaca.some(f => f.weather_desc && f.weather_desc.toLowerCase().includes('hujan'))) {
      shouldNotify = true;
      const rainTypes = todayForecast.cuaca
        .filter(f => f.weather_desc && f.weather_desc.toLowerCase().includes('hujan'))
        .map(f => f.weather_desc)
        .filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
      warningMessage = `Peringatan: Diperkirakan terjadi ${rainTypes.join(', ')} hari ini. Siapkan payung dan perhatikan genangan air!`;
    }
    if (shouldNotify) {
      return res.status(200).json({
        status: 'success',
        should_notify: true,
        message: warningMessage
      });
    }
    // --- Akhir notifikasi cuaca hujan ---
    */

    console.log('[WEATHER] Tidak ada peringatan cuaca khusus hari ini.');
    return res.status(200).json({
      status: 'success',
      should_notify: false,
      message: 'Kondisi cuaca cenderung stabil hari ini.'
    });
  } catch (error) {
    console.error('Error while checking weather warning:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengecek peringatan cuaca'
    });
  }
};

exports.broadcastTestNotification = async (req, res) => {
  try {
    const { title, body } = req.body;
    const { rows } = await pool.query('SELECT token FROM sigab_app.fcm_tokens');
    const tokens = rows.map(r => r.token);
    let success = 0, fail = 0;
    for (const token of tokens) {
      try {
        await sendFcmNotification(token, title || 'Tes Notifikasi', body || 'Ini adalah pesan tes dari backend!');
        success++;
      } catch (e) {
        console.error(`[FCM ERROR] Token: ${token}`);
        if (e?.response?.data) {
          console.error('[FCM ERROR] Response data:', e.response.data);
        } else {
          console.error('[FCM ERROR] Message:', e.message);
        }
        fail++;
      }
    }
    res.json({ status: 'success', sent: success, failed: fail });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
};
