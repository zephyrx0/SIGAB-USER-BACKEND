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

// Fungsi untuk mendapatkan detail tips mitigasi berdasarkan ID
exports.getMitigationTipById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM sigab_app."tips_mitigasi" WHERE id_tips = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Tips mitigasi tidak ditemukan'
      });
    }
    res.status(200).json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error(`Error while fetching mitigation tip with ID ${id}:`, error);
    res.status(500).json({
      status: 'error',
      message: `Terjadi kesalahan saat mengambil detail tips mitigasi dengan ID ${id}`
    });
  }
};