const pool = require('../config/database');

// Fungsi untuk mendapatkan semua informasi banjir
exports.getAllFloodInfo = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sigab_app."informasi_banjir"');
    res.status(200).json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error while fetching flood information:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengambil data informasi banjir'
    });
  }
};

// Fungsi untuk mendapatkan informasi banjir terbaru
exports.getLatestFloodInfo = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sigab_app."informasi_banjir" ORDER BY created_at DESC LIMIT 1'
    );

    if (result.rows.length > 0) {
      res.status(200).json({
        status: 'success',
        data: result.rows[0]
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: 'Tidak ada informasi banjir ditemukan'
      });
    }
  } catch (error) {
    console.error('Error while fetching latest flood information:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengambil data informasi banjir terbaru'
    });
  }
};