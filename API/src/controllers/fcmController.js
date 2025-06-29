const pool = require('../config/database');
const { subscribeToTopic, sendFcmNotification } = require('../utils/fcm');

// Simpan token FCM ke database (upsert by token)
exports.registerFcmToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ status: 'error', message: 'Token FCM wajib diisi' });
    }
    
    // Validasi format token FCM
    if (!token.match(/^[A-Za-z0-9:_-]+$/)) {
      return res.status(400).json({ status: 'error', message: 'Format token FCM tidak valid' });
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

// Test token FCM
exports.testFcmToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Token FCM wajib diisi' 
      });
    }
    
    // Kirim test notification
    await sendFcmNotification(
      token, 
      'Test Notifikasi', 
      'Ini adalah test notifikasi untuk memvalidasi token FCM'
    );
    
    res.json({ 
      status: 'success', 
      message: 'Test notifikasi berhasil dikirim' 
    });
  } catch (error) {
    console.error('Error testing FCM token:', error);
    
    // Check if token is invalid
    if (error.message.includes('unregistered') || error.message.includes('not found')) {
      // Remove invalid token from database
      try {
        await pool.query('DELETE FROM sigab_app.fcm_tokens WHERE token = $1', [req.body.token]);
        console.log(`[FCM] Removed invalid token: ${req.body.token}`);
      } catch (dbError) {
        console.error('[FCM] Error removing invalid token:', dbError.message);
      }
      
      return res.status(400).json({ 
        status: 'error', 
        message: 'Token FCM tidak valid dan telah dihapus dari database' 
      });
    }
    
    res.status(500).json({ 
      status: 'error', 
      message: 'Gagal mengirim test notifikasi' 
    });
  }
};

// Clean up invalid tokens
exports.cleanupInvalidTokens = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT token FROM sigab_app.fcm_tokens WHERE token IS NOT NULL');
    const tokens = rows.map(r => r.token);
    
    let validTokens = [];
    let invalidTokens = [];
    
    for (const token of tokens) {
      try {
        await sendFcmNotification(
          token, 
          'Token Validation', 
          'Validasi token FCM'
        );
        validTokens.push(token);
      } catch (error) {
        if (error.message.includes('unregistered') || error.message.includes('not found')) {
          invalidTokens.push(token);
        }
      }
    }
    
    // Remove invalid tokens
    if (invalidTokens.length > 0) {
      await pool.query(
        'DELETE FROM sigab_app.fcm_tokens WHERE token = ANY($1::text[])',
        [invalidTokens]
      );
    }
    
    res.json({
      status: 'success',
      message: 'Cleanup selesai',
      data: {
        total_tokens: tokens.length,
        valid_tokens: validTokens.length,
        invalid_tokens_removed: invalidTokens.length
      }
    });
  } catch (error) {
    console.error('Error cleaning up invalid tokens:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Gagal membersihkan token invalid' 
    });
  }
};

// Get FCM token statistics
exports.getFcmTokenStats = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as total FROM sigab_app.fcm_tokens WHERE token IS NOT NULL');
    const totalTokens = parseInt(rows[0].total);
    
    res.json({
      status: 'success',
      data: {
        total_tokens: totalTokens,
        last_updated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting FCM token stats:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Gagal mendapatkan statistik token FCM' 
    });
  }
}; 