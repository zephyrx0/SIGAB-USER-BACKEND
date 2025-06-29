const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const userController = require('../controllers/userController');
const laporanController = require('../controllers/laporanController');
const tipsMitigasiController = require('../controllers/tipsMitigasiController');
const informasiBanjirController = require('../controllers/informasiBanjirController');
const tempatEvakuasiController = require('../controllers/tempatEvakuasiController');
const riwayatBanjirController = require('../controllers/riwayatBanjirController');
const notifikasiController = require('../controllers/notifikasiController');
const informasiCuacaController = require('../controllers/informasiCuacaController');
const fcmController = require('../controllers/fcmController');
const { verifyToken } = require('../middlewares/authMiddleware');
const supabase = require('../config/supabaseStorage');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;

// Konfigurasi multer untuk upload file ke memory
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
      return cb(new Error('Hanya file gambar yang diperbolehkan!'), false);
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Tambahkan fungsi untuk menyimpan file lokal sebagai fallback
const saveFileLocally = async (file, fileName) => {
  try {
    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, file.buffer);
    return `${process.env.APP_URL || 'http://localhost:3000'}/uploads/${fileName}`;
  } catch (error) {
    console.error('Error saving file locally:', error);
    throw error;
  }
};

// Middleware untuk upload ke Supabase
const uploadToSupabase = async (req, res, next) => {
  if (!req.file) {
    console.log('No file provided in request');
    return next();
  }

  try {
    const file = req.file;
    const fileExt = path.extname(file.originalname).toLowerCase();
    const fileName = `${uuidv4()}${fileExt}`;
    const filePath = `uploads/${fileName}`;

    // Validasi tipe file
    const allowedTypes = ['.jpg', '.jpeg', '.png'];
    if (!allowedTypes.includes(fileExt)) {
      return res.status(400).json({
        status: 'error',
        message: 'Tipe file tidak didukung. Gunakan file JPG, JPEG, atau PNG.'
      });
    }

    console.log('File details:', {
      name: fileName,
      path: filePath,
      size: file.size,
      type: file.mimetype
    });

    console.log('Attempting Supabase connection...');

    // Coba upload ke Supabase dengan 3 percobaan
    let retries = 3;
    let lastError = null;
    let uploadSuccess = false;

    while (retries > 0 && !uploadSuccess) {
      try {
        console.log(`Upload attempt ${4 - retries}/3...`);
        
        const { data, error } = await supabase.storage
          .from('images')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
            duplex: 'half'
          });

        if (error) throw error;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('images')
          .getPublicUrl(filePath);

        req.file.publicUrl = urlData.publicUrl;
        console.log('File uploaded successfully to Supabase. Public URL:', urlData.publicUrl);
        uploadSuccess = true;
        break;
      } catch (error) {
        lastError = error;
        console.error(`Upload attempt ${4 - retries}/3 failed:`, error);
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries))); // Increasing delay
        }
      }
    }

    // Jika semua percobaan ke Supabase gagal, return error
    if (!uploadSuccess) {
      console.error('All Supabase upload attempts failed. Last error:', lastError);
      return res.status(500).json({
        status: 'error',
        message: 'Gagal mengupload foto ke Supabase setelah beberapa percobaan',
        error: lastError && lastError.message ? lastError.message : lastError
      });
    }

    next();
  } catch (error) {
    console.error('Error in upload middleware:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengupload file: ' + error.message,
      details: error.stack
    });
  }
};

// User endpoints (langsung di /api)
router.post('/register', userController.register);
router.post('/login', userController.login);
router.post('/logout', userController.logoutUser);
router.get('/users', userController.getAllUsers);

// User profile endpoints (langsung di /api)
router.get('/profile', verifyToken, userController.viewProfile);
router.put('/profile', verifyToken, userController.changeProfile);
router.put('/password', verifyToken, userController.changePassword);

// User password reset endpoints (langsung di /api)
router.post('/forgot-password', userController.requestResetPassword);
router.post('/reset-password', userController.resetPassword);

// Endpoint untuk mengambil semua laporan
router.post('/laporan', verifyToken, upload.single('foto'), uploadToSupabase, laporanController.createReport);

// Endpoint untuk mengambil semua tips mitigasi
router.get('/tips-mitigasi', tipsMitigasiController.getAllMitigationTips);

// Endpoint untuk mendapatkan detail tips mitigasi berdasarkan ID
router.get('/tips-mitigasi/:id', tipsMitigasiController.getMitigationTipById);

// Endpoint untuk mengambil semua informasi banjir
router.get('/informasi-banjir', informasiBanjirController.getAllFloodInfo);

// Endpoint untuk mengambil semua tempat evakuasi
router.get('/tempat-evakuasi', tempatEvakuasiController.getAllEvacuationPlaces);

// Endpoint untuk mengambil semua riwayat banjir
router.get('/riwayat-banjir', riwayatBanjirController.getAllFloodHistory);

// Endpoint untuk mendapatkan detail riwayat banjir berdasarkan ID
router.get('/riwayat-banjir/:id', riwayatBanjirController.getFloodHistoryById);

// Endpoint untuk mengambil semua notifikasi
router.get('/notifikasi', notifikasiController.getAllNotifications);

// Endpoint untuk mengecek laporan banjir dan notifikasi
router.get('/check-flood-reports', notifikasiController.checkFloodReports);
router.get('/check-weather-warning', notifikasiController.checkWeatherWarning);

// Endpoint untuk mendapatkan riwayat notifikasi
router.get('/notification-history', notifikasiController.getNotificationHistory);

// Endpoint untuk menghapus notifikasi hari ini (untuk testing)
router.delete('/clear-today-notifications', notifikasiController.clearTodayNotifications);

router.get('/cuaca',informasiCuacaController.getWeather);

router.get('/latest-flood-info', informasiBanjirController.getLatestFloodInfo);

// Endpoint untuk register FCM token
router.post('/register-fcm-token', fcmController.registerFcmToken);

// Endpoint untuk subscribe ke topic
router.post('/subscribe-topic', fcmController.subscribeToTopic);

// Endpoint untuk test token FCM
router.post('/test-fcm-token', fcmController.testFcmToken);

// Endpoint untuk cleanup invalid tokens
router.post('/cleanup-invalid-tokens', fcmController.cleanupInvalidTokens);

// Endpoint untuk mendapatkan statistik FCM tokens
router.get('/fcm-token-stats', fcmController.getFcmTokenStats);

// Endpoint untuk mengirim notifikasi manual ke semua token
router.post('/send-manual-notification', notifikasiController.sendManualNotification);

// Endpoint untuk test FCM sederhana
router.post('/test-fcm-simple', notifikasiController.testFcmSimple);

// Endpoint untuk test FCM hybrid
router.post('/test-fcm-hybrid', notifikasiController.testFcmHybrid);

// Endpoint untuk test FCM dengan smart collapsible (Recommended)
router.post('/test-fcm-smart-collapsible', notifikasiController.testFcmSmartCollapsible);

// Endpoint untuk mengirim ulang notifikasi yang terlewat
router.post('/resend-missed-notifications', notifikasiController.resendMissedNotifications);

// Endpoint untuk mendapatkan statistik notifikasi
router.get('/notification-stats', notifikasiController.getNotificationStats);

// Endpoint untuk broadcast notifikasi FCM tes
router.post('/broadcast-fcm-test', notifikasiController.broadcastTestNotification);

// Endpoint untuk menghapus 2 notifikasi terakhir
router.delete('/delete-last-notifications', notifikasiController.deleteLastNotifications);

module.exports = router;