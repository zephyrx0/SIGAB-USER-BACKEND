const pool = require('../config/database');
const { sendFcmTopicNotification } = require('./fcm');
const { kirimWhatsappKeSemuaUser } = require('./twilioNotifier');

async function kirimNotifikasiTigaLaporanValid() {
  const pesan = 'Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.';
  
  await sendFcmTopicNotification(
    'peringatan-umum',
    'Peringatan Dini Banjir',
    pesan
  );

  // Kirim WhatsApp ke semua user
  await kirimWhatsappKeSemuaUser(pesan);
}

// Fungsi untuk pengecekan dan pengiriman via cron
async function cekDanKirimNotifikasiTigaLaporanValid() {
  // Hitung jumlah laporan valid hari ini
  const result = await pool.query(
    `SELECT COUNT(*) as total
     FROM sigab_app.laporan
     WHERE tipe_laporan = 'Banjir'
     AND status = 'Valid'
     AND DATE(waktu) = CURRENT_DATE`
  );
  const totalValid = parseInt(result.rows[0].total);

  // Cek apakah notifikasi sudah pernah dikirim hari ini
  const notif = await pool.query(
    `SELECT 1 FROM sigab_app.notifikasi
     WHERE judul = $1
     AND DATE(created_at) = CURRENT_DATE
     LIMIT 1`,
    ['Peringatan Dini Banjir']
  );

  if (totalValid >= 3 && notif.rows.length === 0) {
    await kirimNotifikasiTigaLaporanValid();
    await pool.query(
      `INSERT INTO sigab_app.notifikasi (judul, pesan)
       VALUES ($1, $2)`,
      [
        'Peringatan Dini Banjir',
        'Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.'
      ]
    );
    console.log('[CRON][LAPORAN] Notifikasi 3 laporan valid dikirim.');
  } else {
    console.log('[CRON][LAPORAN] Belum memenuhi syarat atau sudah dikirim.');
  }
}

module.exports = { kirimNotifikasiTigaLaporanValid, cekDanKirimNotifikasiTigaLaporanValid }; 