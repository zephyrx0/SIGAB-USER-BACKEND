const pool = require('../config/database');

// Fungsi untuk mendapatkan semua tempat evakuasi
exports.getAllEvacuationPlaces = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sigab_app."tempat_evakuasi"');
    res.status(200).json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error while fetching evacuation places:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengambil data tempat evakuasi'
    });
  }
};
