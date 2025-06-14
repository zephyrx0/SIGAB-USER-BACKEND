const pool = require('../config/database');

// Fungsi untuk mendapatkan semua tips mitigasi
exports.getAllMitigationTips = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sigab_app."tips_mitigasi"');
    res.status(200).json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error while fetching mitigation tips:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengambil data tips mitigasi'
    });
  }
};
