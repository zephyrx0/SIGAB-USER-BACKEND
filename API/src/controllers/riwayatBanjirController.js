const pool = require('../config/database');

// Fungsi untuk mendapatkan semua riwayat banjir
exports.getAllFloodHistory = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sigab_app."riwayat_banjir" ORDER BY waktu_kejadian DESC');
    res.status(200).json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error while fetching flood history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengambil data riwayat banjir'
    });
  }
};

// Fungsi untuk mendapatkan detail riwayat banjir berdasarkan ID
exports.getFloodHistoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM sigab_app."riwayat_banjir" WHERE id_riwayat = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Riwayat banjir tidak ditemukan'
      });
    }

    res.status(200).json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error while fetching flood history by ID:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengambil detail riwayat banjir'
    });
  }
};
