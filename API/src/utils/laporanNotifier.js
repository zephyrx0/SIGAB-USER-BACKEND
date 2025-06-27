const pool = require('../config/database');
const { sendFcmTopicNotification } = require('./fcm');
const { kirimWhatsappKeSemuaUser } = require('./twilioNotifier');

async function kirimNotifikasiTigaLaporanValid() {
  const pesan = 'Terdapat 3 laporan banjir valid hari ini. Mohon waspada dan perhatikan informasi lebih lanjut.';
  
  // Cek duplikasi hanya untuk hari ini
  const cek = await pool.query(
    `SELECT 1 FROM sigab_app.notifikasi 
     WHERE judul = $1 
       AND pesan = $2 
       AND DATE(created_at) = CURRENT_DATE
     LIMIT 1`,
    ['Peringatan Dini Banjir', pesan]
  );
  if (cek.rows.length > 0) {
    console.log('[LAPORAN][CRON] Notifikasi 3 laporan valid sudah pernah dikirim hari ini, skip.');
    return;
  }
  
  console.log('[LAPORAN][FCM] Akan mengirim notifikasi 3 laporan valid...');
  await sendFcmTopicNotification(
    'peringatan-umum',
    'Peringatan Dini Banjir',
    pesan
  );

  // Delay 2 detik sebelum kirim WhatsApp untuk menghindari duplikasi
  console.log('[LAPORAN][DELAY] Menunggu 2 detik sebelum kirim WhatsApp...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Kirim WhatsApp ke semua user
  console.log('[LAPORAN][TWILIO] Akan mengirim WhatsApp...');
  await kirimWhatsappKeSemuaUser(pesan);
  console.log('[LAPORAN][TWILIO] Selesai mengirim WhatsApp');
  
  // Simpan ke tabel notifikasi
  await pool.query(
    'INSERT INTO sigab_app.notifikasi (judul, pesan, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT DO NOTHING',
    ['Peringatan Dini Banjir', pesan]
  );
  console.log('[LAPORAN][DB] Notifikasi 3 laporan valid berhasil disimpan ke database');
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