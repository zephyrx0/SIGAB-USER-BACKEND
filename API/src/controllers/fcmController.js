const pool = require('../config/database');
const { subscribeToTopic } = require('../utils/fcm');

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
    
    // Subscribe token ke topic peringatan umum
    try {
      await subscribeToTopic(token, 'peringatan-umum');
      console.log(`[FCM] Token ${token} berhasil subscribe ke topic peringatan-umum`);
    } catch (subscribeError) {
      console.error(`[FCM] Gagal subscribe token ke topic:`, subscribeError.message);
      // Tidak return error karena token sudah tersimpan
    }
    
    res.json({ status: 'success', message: 'Token FCM berhasil didaftarkan' });
  } catch (error) {
    console.error('Error register FCM token:', error);
    res.status(500).json({ status: 'error', message: 'Gagal mendaftarkan token FCM' });
  }
};

// Subscribe token ke topic tertentu
exports.subscribeToTopic = async (req, res) => {
  try {
    const { token, topic } = req.body;
    if (!token || !topic) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Token FCM dan topic wajib diisi' 
      });
    }
    
    await subscribeToTopic(token, topic);
    res.json({ 
      status: 'success', 
      message: `Token berhasil subscribe ke topic: ${topic}` 
    });
  } catch (error) {
    console.error('Error subscribe to topic:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Gagal subscribe ke topic' 
    });
  }
}; 