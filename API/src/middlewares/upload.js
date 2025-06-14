const multer = require('multer');
const path = require('path');
const fs = require('fs');
const supabase = require('../config/supabaseStorage');

// Konfigurasi penyimpanan file menggunakan multer (temporary storage)
const storage = multer.memoryStorage();

// Function to determine correct MIME type
const getCorrectMimeType = (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    default:
      return 'image/jpeg'; // default to jpeg if unknown
  }
};

// Filter file yang bisa di-upload (misal hanya gambar)
const fileFilter = (req, file, cb) => {
  console.log('Received mimetype:', file.mimetype);
  const ext = path.extname(file.originalname).toLowerCase();
  
  // Check if file extension is valid
  if (['.jpg', '.jpeg', '.png'].includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Tipe file tidak diperbolehkan. Hanya file JPG, JPEG, dan PNG yang diperbolehkan.'), false);
  }
};

// Mengatur multer dengan penyimpanan dan filter
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }  // Maksimal 10MB
});

// Middleware untuk mengupload file ke Supabase Storage
const uploadToSupabase = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    const file = req.file;
    const fileExt = path.extname(file.originalname).toLowerCase();
    const fileName = `${Date.now()}${fileExt}`;
    const filePath = `uploads/${fileName}`;

    // Determine correct MIME type
    const correctMimeType = getCorrectMimeType(file);
    console.log('Using MIME type:', correctMimeType);

    // Upload file ke Supabase Storage
    const { data, error } = await supabase.storage
      .from('images')  // Menggunakan bucket 'images' sesuai konfigurasi
      .upload(filePath, file.buffer, {
        contentType: correctMimeType,
        upsert: true
      });

    if (error) {
      console.error('Upload error:', error);
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('images')  // Menggunakan bucket 'images' sesuai konfigurasi
      .getPublicUrl(filePath);

    // Simpan nama file dan URL publik ke request
    req.file.filename = fileName;
    req.file.publicUrl = publicUrl;
    next();
  } catch (error) {
    console.error('Error uploading to Supabase:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengupload file: ' + error.message
    });
    }
};

module.exports = { upload, uploadToSupabase };