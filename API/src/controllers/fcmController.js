const pool = require('../config/database');

// Simpan token FCM ke database (upsert by token)
exports.registerFcmToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ status: 'error', message: 'Token FCM wajib diisi' });
    }
    // Upsert token ke tabel fcm_tokens
    await pool.query(
      `INSERT INTO sigab_app.fcm_tokens (token)
       VALUES ($1)
       ON CONFLICT (token) DO NOTHING`,
      [token]
    );
    res.json({ status: 'success', message: 'Token FCM berhasil didaftarkan' });
  } catch (error) {
    console.error('Error register FCM token:', error);
    res.status(500).json({ status: 'error', message: 'Gagal mendaftarkan token FCM' });
  }
}; 