const pool = require('../config/database');
const axios = require('axios');

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
    // Ambil data cuaca dari BMKG
    const response = await axios.get('https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.04.12.2006');
    
    // Validasi response data
    if (!response.data || !Array.isArray(response.data)) {
      console.error('Invalid BMKG API response format:', response.data);
      return res.status(200).json({
        status: 'success',
        should_notify: false,
        message: 'Data cuaca tidak tersedia saat ini.'
      });
    }

    // Analisis data cuaca untuk hari ini
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD

    // Cari data cuaca untuk hari ini
    const todayForecast = response.data.find(day => day.tanggal === todayStr);
    
    if (!todayForecast || !todayForecast.cuaca || !Array.isArray(todayForecast.cuaca)) {
      return res.status(200).json({
        status: 'success',
        should_notify: false,
        message: 'Data cuaca hari ini belum tersedia.'
      });
    }

    // Analisis kondisi cuaca
    let shouldNotify = false;
    let warningMessage = '';
    let consecutiveRainHours = 0;
    let rainStartTime = null;
    let rainType = null;
    let lastRainTime = null;
    let maxRainIntensity = 0;

    // Loop melalui perkiraan cuaca per jam
    for (const forecast of todayForecast.cuaca) {
      if (!forecast.weather_desc || !forecast.local_datetime) continue;

      const weatherDesc = forecast.weather_desc.toLowerCase();
      const localTime = new Date(forecast.local_datetime);

      // Deteksi intensitas hujan
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
        // Reset jika hujan berhenti
        rainStartTime = null;
        consecutiveRainHours = 0;
        lastRainTime = null;
        maxRainIntensity = 0;
      }
    }

    // Tentukan apakah perlu notifikasi berdasarkan kondisi
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

    res.status(200).json({
      status: 'success',
      should_notify: shouldNotify,
      message: warningMessage || 'Kondisi cuaca cenderung stabil hari ini.'
    });
  } catch (error) {
    console.error('Error while checking weather warning:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengecek peringatan cuaca'
    });
  }
};
