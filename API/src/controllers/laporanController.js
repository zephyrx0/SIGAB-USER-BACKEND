const pool = require('../config/database');

// Fungsi untuk membuat laporan baru
exports.createReport = async (req, res) => {
  try {
    const id_user = req.body.id_user;
    const tipe_laporan = req.body.tipe_laporan;
    const lokasi = req.body.lokasi; // Nama lokasi seperti "Masjid An-Nur"
    const titik_lokasi = req.body.titik_lokasi; // Bentuk string: "(107.61,-6.982)"
    const waktu = req.body.waktu;
    const deskripsi = req.body.deskripsi;
    const status = req.body.status;
    
    // Handle foto URL
    let foto = null;
    if (req.file && req.file.publicUrl) {
      foto = req.file.publicUrl;
      console.log('Using uploaded file URL:', foto);
    } else if (req.body.foto) {
      foto = req.body.foto;
      console.log('Using provided foto URL:', foto);
    } else {
      console.log('No foto provided');
    }

    console.log('Received data:', {
      id_user,
      tipe_laporan,
      lokasi,
      titik_lokasi,
      waktu,
      deskripsi,
      status,
      foto,
      file: req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : 'No file'
    });

    const requiredFields = {
      id_user,
      tipe_laporan,
      waktu,
      deskripsi,
      lokasi,
      titik_lokasi
    };

    // Log validation results
    console.log('Validating required fields:');
    for (const [key, value] of Object.entries(requiredFields)) {
      console.log(`${key}: ${value ? 'valid' : 'missing'}`);
      if (!value || value.toString().trim() === '') {
        return res.status(400).json({
          status: 'error',
          message: `Field '${key}' wajib diisi`
        });
      }
    }

    // Validasi user
    const userCheck = await pool.query('SELECT 1 FROM sigab_app.user_app WHERE id_user = $1', [id_user]);
    console.log('User validation:', userCheck.rowCount > 0 ? 'valid' : 'not found');
    if (userCheck.rowCount === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'User dengan ID tersebut tidak ditemukan'
      });
    }

    // Validasi titik format (opsional)
    if (titik_lokasi) {
      const match = titik_lokasi.match(/^\((-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)\)$/);
      console.log('Coordinate validation:', match ? 'valid' : 'invalid');
      if (!match) {
        return res.status(400).json({
          status: 'error',
          message: 'Format koordinat tidak valid. Gunakan format "(longitude,latitude)"'
        });
      }
    }

    // Insert laporan
    console.log('Attempting to insert report with values:', {
      id_user,
      tipe_laporan,
      waktu,
      deskripsi,
      status,
      foto,
      lokasi,
      titik_lokasi
    });

    const result = await pool.query(
      `INSERT INTO sigab_app.laporan 
      (id_user, tipe_laporan, waktu, deskripsi, status, foto, created_at, updated_at, lokasi, titik_lokasi) 
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, $8)
      RETURNING id_laporan`,
      [id_user, tipe_laporan, waktu, deskripsi, status, foto, lokasi, titik_lokasi]
    );

    console.log('Report inserted successfully with ID:', result.rows[0].id_laporan);

    res.status(201).json({
      status: 'success',
      message: 'Laporan berhasil dibuat',
      data: {
        id_laporan: result.rows[0].id_laporan,
        foto_url: foto
      }
    });
  } catch (error) {
    console.error('Error while creating report:', error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat membuat laporan: ' + error.message
    });
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