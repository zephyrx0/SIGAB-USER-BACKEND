const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
// Hapus userController dari sini karena sudah ditangani di userRoutes.js
// const userController = require('../controllers/userController'); 
const laporanController = require('../controllers/laporanController');
const tipsMitigasiController = require('../controllers/tipsMitigasiController');
const informasiBanjirController = require('../controllers/informasiBanjirController');
const tempatEvakuasiController = require('../controllers/tempatEvakuasiController');
const riwayatBanjirController = require('../controllers/riwayatBanjirController');
const notifikasiController = require('../controllers/notifikasiController');
const informasiCuacaController = require('../controllers/informasiCuacaController');
const { verifyToken } = require('../middlewares/authMiddleware');
const supabase = require('../config/supabaseStorage');
const { v4: uuidv4 } = require('uuid');

// Impor userRoutes baru
const userRoutes = require('./userRoutes');

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

// Middleware untuk upload ke Supabase
const uploadToSupabase = async (req, res, next) => {
  if (!req.file) {
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

    // Tentukan content type berdasarkan ekstensi file
    let contentType;
    switch (fileExt) {
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      default:
        return res.status(400).json({
          status: 'error',
          message: 'Tipe file tidak didukung'
        });
    }

    console.log('Uploading file:', {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      contentType: contentType
    });

    // Upload ke Supabase Storage dengan content type yang benar
    const { data, error } = await supabase.storage
      .from('images')
      .upload(filePath, file.buffer, {
        contentType: contentType,
        upsert: true
      });

    if (error) {
      console.error('Upload error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Gagal mengupload foto: ' + error.message
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(filePath);

    // Simpan URL ke request
    req.file.publicUrl = urlData.publicUrl;
    console.log('File uploaded successfully. Public URL:', urlData.publicUrl);
    next();
  } catch (error) {
    console.error('Error uploading to Supabase:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengupload file: ' + error.message
    });
  }
};

// Gunakan userRoutes untuk endpoint yang berkaitan dengan pengguna
// Biasanya diawali dengan /auth atau /users
router.use('/users', userRoutes); 

// Hapus endpoint register, login, dan logout yang lama dari sini
// router.post('/register', userController.register);
// router.post('/login', userController.login);
// router.post('/logout', userController.logoutUser);


// Endpoint untuk mengambil semua data user (jika masih diperlukan, bisa dipindah ke userRoutes atau adminRoutes)
// router.get('/users', userController.getAllUsers);

// Endpoint untuk mengambil semua laporan
// router.get('/laporan', laporanController.getAllReports);
router.post('/laporan', verifyToken, upload.single('foto'), uploadToSupabase, laporanController.createReport);

// Endpoint untuk mengambil semua tips mitigasi
router.get('/tips-mitigasi', tipsMitigasiController.getAllMitigationTips);

// Endpoint untuk mengambil semua informasi banjir
router.get('/informasi-banjir', informasiBanjirController.getAllFloodInfo);

// Endpoint untuk mengambil semua tempat evakuasi
router.get('/tempat-evakuasi', tempatEvakuasiController.getAllEvacuationPlaces);

// Endpoint untuk mengambil semua riwayat banjir
router.get('/riwayat-banjir', riwayatBanjirController.getAllFloodHistory);

// Endpoint untuk mengambil semua notifikasi
router.get('/notifikasi', notifikasiController.getAllNotifications);

// Endpoint untuk mengecek laporan banjir dan notifikasi
router.get('/check-flood-reports', notifikasiController.checkFloodReports);
router.get('/check-weather-warning', notifikasiController.checkWeatherWarning);

// Endpoint untuk mendapatkan riwayat notifikasi
router.get('/notification-history', notifikasiController.getNotificationHistory);

router.get('/cuaca',informasiCuacaController.getWeather);

// Endpoint untuk mengupdate status laporan
router.put('/laporan/:id_laporan/status', laporanController.updateReportStatus);

// Logout route sudah dipindahkan ke userRoutes
// router.post('/logout', userController.logoutUser);

router.get('/latest-flood-info', informasiBanjirController.getLatestFloodInfo);

module.exports = router;