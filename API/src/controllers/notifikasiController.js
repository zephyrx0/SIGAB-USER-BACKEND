const pool = require('../config/database');
const axios = require('axios');
const { sendFcmNotification, sendFcmTopicNotification, sendFcmToAllTokens, cleanupInvalidTokens } = require('../utils/fcm');
const { kirimNotifikasiBanjirTerbaru } = require('../utils/banjirNotifier');
const { kirimNotifikasiCuaca } = require('../utils/cuacaNotifier');
const cron = require('node-cron');
const { cekDanKirimNotifikasiTigaLaporanValid } = require('../utils/laporanNotifier');

// Scheduler: Notifikasi banjir setiap 10 menit
cron.schedule('*/10 * * * * *', async () => {
  try {
    await kirimNotifikasiBanjirTerbaru();
    // Log akan muncul di dalam fungsi jika notifikasi benar-benar dikirim
  } catch (e) {
    console.error('[CRON] Gagal kirim notifikasi banjir:', e.message);
  }
});

cron.schedule('*/12 * * * * *', async () => {
  try {
    await cekDanKirimNotifikasiTigaLaporanValid();
    // Log akan muncul di dalam fungsi jika notifikasi benar-benar dikirim
  } catch (e) {
    console.error('[CRON] Gagal kirim notifikasi laporan:', e.message);
  }
});

// Scheduler: Notifikasi cuaca setiap 30 menit (diubah dari 10 detik)
cron.schedule('*/15 * * * * *', async () => {
  try {
    await kirimNotifikasiCuaca();
    // Log akan muncul di dalam fungsi jika notifikasi benar-benar dikirim
  } catch (e) {
    console.error('[CRON] Gagal kirim notifikasi cuaca:', e.message);
  }
});

// Scheduler: Cleanup invalid FCM tokens setiap hari jam 2 pagi
cron.schedule('0 2 * * *', async () => {
  try {
    console.log('[CRON] Memulai cleanup invalid FCM tokens...');
    await cleanupInvalidTokens();
    console.log('[CRON] Cleanup invalid FCM tokens selesai');
  } catch (e) {
    console.error('[CRON] Gagal cleanup invalid FCM tokens:', e.message);
  }
});

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

// Fungsi untuk memanipulasi data BMKG agar selalu menampilkan hujan (untuk demo)
function manipulateBMKGDataForDemo(originalData) {
  try {
    console.log('[WEATHER DEMO] Memanipulasi data BMKG untuk demo...');
    
    // Deep copy data
    const manipulatedData = JSON.parse(JSON.stringify(originalData));
    
    // Navigasi ke data cuaca
    if (manipulatedData.data && Array.isArray(manipulatedData.data)) {
      for (const location of manipulatedData.data) {
        if (location.cuaca && Array.isArray(location.cuaca)) {
          for (const period of location.cuaca) {
            if (Array.isArray(period)) {
              for (const forecast of period) {
                if (forecast && typeof forecast === 'object') {
                  // Ubah weather_desc menjadi hujan
                  forecast.weather_desc = 'Hujan Lebat';
                  // Ubah weather code menjadi kode hujan (60-69 adalah kode hujan BMKG)
                  forecast.weather = 60;
                }
              }
            }
          }
        }
      }
    }
    
    console.log('[WEATHER DEMO] Data BMKG berhasil dimanipulasi untuk demo');
    return manipulatedData;
  } catch (error) {
    console.error('[WEATHER DEMO] Error saat manipulasi data:', error);
    return originalData;
  }
}

// Fungsi untuk mengecek peringatan cuaca (hujan hari ini)
exports.checkWeatherWarning = async (req, res) => {
  try {
    console.log('[WEATHER] Memulai pengecekan peringatan cuaca...');
    // Ambil data cuaca dari BMKG
    const response = await axios.get('https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.04.12.2006');
    console.log('[WEATHER] Data BMKG diterima:', JSON.stringify(response.data).slice(0, 500)); // log sebagian data
    
    // === DEMO MODE: Manipulasi data untuk demo - ubah semua cuaca menjadi hujan ===
    // const manipulatedResponseData = manipulateBMKGDataForDemo(response.data);
    // === ORIGINAL CODE (dikomentari untuk demo) ===
    const manipulatedResponseData = response.data;
    
    let cuacaList = [];
    if (Array.isArray(manipulatedResponseData)) {
      cuacaList = manipulatedResponseData;
      console.log('[WEATHER] Struktur data: Array root, length:', cuacaList.length);
    } else if (manipulatedResponseData && manipulatedResponseData.data && Array.isArray(manipulatedResponseData.data)) {
      cuacaList = manipulatedResponseData.data;
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

    // --- Notifikasi cuaca hujan (aktif) ---
    let rainFound = false;
    let rainTime = null;
    for (const forecast of todayForecasts) {
      if (!forecast.weather_desc || !forecast.local_datetime) continue;
      const weatherDesc = forecast.weather_desc.toLowerCase();
      const weatherCode = forecast.weather;
      // Perbaikan parsing waktu agar sesuai WIB
      let localTime;
      if (forecast.local_datetime.includes('+07:00')) {
        localTime = new Date(forecast.local_datetime.replace(' ', 'T'));
      } else {
        localTime = new Date(forecast.local_datetime.replace(' ', 'T') + '+07:00');
      }
      // Pastikan localTime benar-benar tanggal hari ini
      const localTimeStr = localTime.toISOString().split('T')[0];
      if (localTimeStr !== todayStr) continue;
      // Pastikan jam forecast >= jam sekarang (WIB)
      const nowWIB = new Date(new Date().getTime() + (7 * 60 * 60 * 1000));
      if (localTime < nowWIB) continue;

      if (weatherDesc.includes('hujan') || (weatherCode && weatherCode >= 60)) {
        rainFound = true;
        rainTime = localTime;
        console.log('[WEATHER] Hujan ditemukan pada:', rainTime);
        break;
      }
    }
    if (rainFound && rainTime) {
      // Format jam dengan zona waktu WIB yang benar
      const timeFormat = rainTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
      const msg = `Peringatan: Diperkirakan hujan hari ini pada pukul ${timeFormat} WIB. Siapkan payung dan waspadai genangan air!`;
      console.log('[WEATHER] Mengirim notifikasi cuaca hujan:', msg);
      return res.status(200).json({
        status: 'success',
        should_notify: true,
        message: msg
      });
    }
    // --- Akhir notifikasi cuaca hujan ---

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

// Endpoint untuk trigger notifikasi peringatan banjir secara manual
exports.triggerNotifikasiBanjir = async (req, res) => {
  try {
    await kirimNotifikasiBanjirTerbaru();
    res.json({ status: 'success', message: 'Notifikasi banjir dikirim' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
};

// Endpoint untuk trigger notifikasi peringatan cuaca secara manual
exports.triggerNotifikasiCuaca = async (req, res) => {
  try {
    await kirimNotifikasiCuaca();
    res.json({ status: 'success', message: 'Notifikasi cuaca dikirim' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
};

exports.deleteLastNotifications = async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 2;
    // Ambil id 2 notifikasi terakhir
    const { rows } = await pool.query(
      'SELECT id_notifikasi FROM sigab_app.notifikasi ORDER BY created_at DESC LIMIT $1',
      [count]
    );
    const ids = rows.map(r => r.id_notifikasi);
    if (ids.length > 0) {
      await pool.query(
        'DELETE FROM sigab_app.notifikasi WHERE id_notifikasi = ANY($1::int[])',
        [ids]
      );
    }
    res.json({ status: 'success', deleted: ids.length });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
};

// Endpoint untuk menghapus notifikasi hari ini (untuk testing)
exports.clearTodayNotifications = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM sigab_app.notifikasi WHERE DATE(created_at) = CURRENT_DATE'
    );
    res.json({ 
      status: 'success', 
      message: 'Notifikasi hari ini berhasil dihapus',
      deleted: result.rowCount 
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
};

// Endpoint untuk mengirim notifikasi manual ke semua token
exports.sendManualNotification = async (req, res) => {
  try {
    const { title, body, data } = req.body;
    
    if (!title || !body) {
      return res.status(400).json({
        status: 'error',
        message: 'Title dan body wajib diisi'
      });
    }

    // Simpan ke database
    await pool.query(
      'INSERT INTO sigab_app.notifikasi (judul, pesan, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
      [title, body]
    );

    // Kirim ke semua token terdaftar
    const result = await sendFcmToAllTokens(title, body, data || {});

    res.json({
      status: 'success',
      message: 'Notifikasi manual berhasil dikirim',
      data: {
        sent: result.success,
        failed: result.fail,
        total: result.success + result.fail
      }
    });
  } catch (error) {
    console.error('Error sending manual notification:', error);
    res.status(500).json({
      status: 'error',
      message: 'Gagal mengirim notifikasi manual'
    });
  }
};

// Endpoint untuk test FCM sederhana
exports.testFcmSimple = async (req, res) => {
  try {
    const { sendFcmToAllTokens } = require('../utils/fcm');
    
    const result = await sendFcmToAllTokens(
      'Test Notifikasi Sederhana',
      'Ini adalah test notifikasi dengan payload yang disederhanakan',
      { test: 'simple', timestamp: Date.now().toString() }
    );

    res.json({
      status: 'success',
      message: 'Test FCM sederhana selesai',
      data: {
        sent: result.success,
        failed: result.fail,
        invalid_removed: result.invalidTokens?.length || 0
      }
    });
  } catch (error) {
    console.error('Error testing FCM simple:', error);
    res.status(500).json({
      status: 'error',
      message: 'Gagal test FCM sederhana'
    });
  }
};

// Endpoint untuk mengirim ulang notifikasi yang terlewat (dengan smart collapsible)
exports.resendMissedNotifications = async (req, res) => {
  try {
    const { token, last_seen_at } = req.body;
    
    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Token FCM diperlukan'
      });
    }

    const { resendNotificationsFromExistingTable } = require('../utils/fcm');
    
    const result = await resendNotificationsFromExistingTable(token, last_seen_at);
    
    res.json({
      status: 'success',
      message: 'Pengiriman ulang notifikasi selesai',
      data: {
        sent: result.sent,
        failed: result.failed,
        total: result.total,
        message: result.message
      }
    });
  } catch (error) {
    console.error('Error resending missed notifications:', error);
    res.status(500).json({
      status: 'error',
      message: 'Gagal mengirim ulang notifikasi'
    });
  }
};

// Endpoint untuk test FCM dengan smart collapsible
exports.testFcmSmartCollapsible = async (req, res) => {
  try {
    const { sendFcmSmartCollapsible } = require('../utils/fcm');
    
    const result = await sendFcmSmartCollapsible(
      'Test Notifikasi Smart Collapsible',
      'Ini adalah test notifikasi dengan smart collapsible (TTL 7 hari, tanpa database tambahan)',
      { 
        test: 'smart_collapsible', 
        timestamp: Date.now().toString(),
        source: 'manual_test'
      }
    );

    res.json({
      status: 'success',
      message: 'Test FCM smart collapsible selesai',
      data: {
        topic_success: result.topicSuccess,
        individual_sent: result.individualSuccess,
        individual_failed: result.individualFailed,
        invalid_removed: result.invalidTokens?.length || 0,
        notification_id: result.notificationId,
        ttl: '7 days',
        no_additional_tables: true
      }
    });
  } catch (error) {
    console.error('Error testing FCM smart collapsible:', error);
    res.status(500).json({
      status: 'error',
      message: 'Gagal test FCM smart collapsible'
    });
  }
};

// Fungsi untuk mendapatkan statistik notifikasi
exports.getNotificationStats = async (req, res) => {
  try {
    // Total notifikasi
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM sigab_app.notifikasi');
    const totalNotifications = parseInt(totalResult.rows[0].total);

    // Notifikasi hari ini
    const todayResult = await pool.query(
      'SELECT COUNT(*) as today FROM sigab_app.notifikasi WHERE DATE(created_at) = CURRENT_DATE'
    );
    const todayNotifications = parseInt(todayResult.rows[0].today);

    // Notifikasi 7 hari terakhir
    const weekResult = await pool.query(
      'SELECT COUNT(*) as week FROM sigab_app.notifikasi WHERE created_at >= NOW() - INTERVAL \'7 days\''
    );
    const weekNotifications = parseInt(weekResult.rows[0].week);

    // Notifikasi terbaru (5 terakhir)
    const recentResult = await pool.query(
      'SELECT id_notifikasi, judul, pesan, created_at FROM sigab_app.notifikasi ORDER BY created_at DESC LIMIT 5'
    );

    // Statistik per jenis notifikasi
    const typeStatsResult = await pool.query(
      `SELECT 
        CASE 
          WHEN judul LIKE '%Banjir%' THEN 'banjir'
          WHEN judul LIKE '%Cuaca%' THEN 'cuaca'
          WHEN judul LIKE '%Laporan%' THEN 'laporan'
          ELSE 'lainnya'
        END as type,
        COUNT(*) as count
       FROM sigab_app.notifikasi 
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY 
        CASE 
          WHEN judul LIKE '%Banjir%' THEN 'banjir'
          WHEN judul LIKE '%Cuaca%' THEN 'cuaca'
          WHEN judul LIKE '%Laporan%' THEN 'laporan'
          ELSE 'lainnya'
        END
       ORDER BY count DESC`
    );

    res.status(200).json({
      status: 'success',
      data: {
        total_notifications: totalNotifications,
        today_notifications: todayNotifications,
        week_notifications: weekNotifications,
        recent_notifications: recentResult.rows,
        type_statistics: typeStatsResult.rows,
        last_updated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting notification stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengambil statistik notifikasi'
    });
  }
};

// Endpoint untuk test FCM hybrid (topic + individual)
exports.testFcmHybrid = async (req, res) => {
  try {
    const { sendFcmHybridNotification } = require('../utils/fcm');
    
    const result = await sendFcmHybridNotification(
      'Test Notifikasi Hybrid',
      'Ini adalah test notifikasi dengan hybrid approach (topic + individual)',
      { 
        test: 'hybrid', 
        timestamp: Date.now().toString(),
        source: 'manual_test'
      }
    );

    res.json({
      status: 'success',
      message: 'Test FCM hybrid selesai',
      data: {
        topic_success: result.topicSuccess,
        individual_sent: result.individualSuccess,
        individual_failed: result.individualFailed,
        invalid_removed: result.invalidTokens?.length || 0,
        notification_id: result.notificationId
      }
    });
  } catch (error) {
    console.error('Error testing FCM hybrid:', error);
    res.status(500).json({
      status: 'error',
      message: 'Gagal test FCM hybrid'
    });
  }
};

module.exports.kirimNotifikasiBanjirTerbaru = kirimNotifikasiBanjirTerbaru;
module.exports.kirimNotifikasiCuaca = kirimNotifikasiCuaca;
