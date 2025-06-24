const pool = require('../config/database');

// Fungsi untuk membuat laporan baru
exports.createReport = async (req, res) => {
  try {
    // Validasi field wajib lebih awal
    const requiredFields = ['id_user', 'tipe_laporan', 'waktu', 'deskripsi', 'lokasi', 'titik_lokasi'];
    for (const field of requiredFields) {
      if (!req.body[field] || req.body[field].toString().trim() === '') {
        return res.status(400).json({ status: 'error', message: `Field '${field}' wajib diisi` });
      }
    }

    // Validasi foto
    if (!req.file && !req.body.foto) {
      return res.status(400).json({ status: 'error', message: 'Foto wajib diunggah' });
    }

    // Validasi format foto URL jika menggunakan URL
    if (req.body.foto && !req.file) {
      try { new URL(req.body.foto); } catch {
        return res.status(400).json({ status: 'error', message: 'Format URL foto tidak valid' });
      }
    }

    // Validasi user (bisa pakai cache jika perlu)
    const userCheck = await pool.query('SELECT 1 FROM sigab_app.user_app WHERE id_user = $1', [req.body.id_user]);
    if (userCheck.rowCount === 0) {
      return res.status(400).json({ status: 'error', message: 'User dengan ID tersebut tidak ditemukan' });
    }

    // Validasi titik_lokasi
    if (!/^\((-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)\)$/.test(req.body.titik_lokasi)) {
      return res.status(400).json({ status: 'error', message: 'Format koordinat tidak valid. Gunakan format \"(longitude,latitude)\"' });
    }

    // Insert laporan
    const foto = req.file?.publicUrl || req.body.foto;
    const { id_user, tipe_laporan, waktu, deskripsi, status, lokasi, titik_lokasi } = req.body;
    const result = await pool.query(
      `INSERT INTO sigab_app.laporan 
      (id_user, tipe_laporan, waktu, deskripsi, status, foto, created_at, updated_at, lokasi, titik_lokasi) 
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, $8)
      RETURNING id_laporan`,
      [id_user, tipe_laporan, waktu, deskripsi, status, foto, lokasi, titik_lokasi]
    );

    return res.status(201).json({
      status: 'success',
      message: 'Laporan berhasil dibuat',
      data: { id_laporan: result.rows[0].id_laporan, foto_url: foto }
    });
  } catch (error) {
    // Log error hanya di server
    if (process.env.NODE_ENV === 'development') console.error('Error while creating report:', error);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat membuat laporan' });
  }
};

// Fungsi untuk mengupdate status laporan
exports.updateReportStatus = async (req, res) => {
  try {
    const { id_laporan } = req.params;
    const { status } = req.body;

    // Update status laporan
    const result = await pool.query(
      'UPDATE sigab_app.laporan SET status = $1, updated_at = NOW() WHERE id_laporan = $2 RETURNING *',
      [status, id_laporan]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Laporan tidak ditemukan'
      });
    }

    // Jika status diubah menjadi valid, cek jumlah laporan valid hari ini
    if (status === 'Valid') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const checkResult = await pool.query(
        `SELECT COUNT(*) as total
         FROM sigab_app.laporan
         WHERE tipe_laporan = 'Banjir'
         AND status = 'Valid'
         AND DATE(waktu) = DATE($1)`,
        [today]
      );

      const totalValidReports = parseInt(checkResult.rows[0].total);

      // Jika sudah ada 3 laporan valid hari ini, buat notifikasi
      if (totalValidReports >= 3) {
        await pool.query(
          `INSERT INTO sigab_app.notifikasi (judul, pesan)
           VALUES ($1, $2)`,
          [
            'Peringatan Dini Banjir',
            'Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.'
          ]
        );
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Status laporan berhasil diperbarui',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error while updating report status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat memperbarui status laporan'
    });
  }
};