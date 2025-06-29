const pool = require('../config/database');
const { sendFcmTopicNotification } = require('./fcm');
const { kirimWhatsappKeSemuaUser } = require('./twilioNotifier');

// Flag untuk menandakan job sedang berjalan
let isJobRunning = false;

async function kirimNotifikasiBanjirTerbaru() {
  if (isJobRunning) {
    console.log('[BANJIR][CRON] Skip, job sebelumnya masih berjalan.');
    return;
  }

  isJobRunning = true; // Set lock
  console.log('[BANJIR][CRON] Memulai pengecekan notifikasi banjir...');
  
  try {
    const result = await pool.query(
      'SELECT wilayah_banjir FROM sigab_app.informasi_banjir ORDER BY waktu_kejadian DESC LIMIT 1'
    );
    if (result.rows.length === 0) {
      console.log('[BANJIR][CRON] Tidak ada data banjir tersedia');
      return; // Jangan lupa return di sini
    }
    const { wilayah_banjir } = result.rows[0];
    const deskripsi = `Banjir terdeteksi di wilayah ${wilayah_banjir}, Mohon waspada`;

    // Cek duplikasi yang lebih ketat - berdasarkan judul dan tanggal
    const cek = await pool.query(
      `SELECT 1 FROM sigab_app.notifikasi 
       WHERE judul = $1 
         AND DATE(created_at) = CURRENT_DATE
         AND pesan LIKE $2
       LIMIT 1`,
      ['Informasi Banjir Terbaru', `%${wilayah_banjir}%`]
    );
    if (cek.rows.length > 0) {
      console.log('[BANJIR][CRON] Notifikasi banjir untuk wilayah ini sudah pernah dikirim hari ini, skip.');
      return;
    }

    // Tambahan: Cek apakah ada notifikasi banjir dalam 1 jam terakhir
    const cekJam = await pool.query(
      `SELECT 1 FROM sigab_app.notifikasi 
       WHERE judul = $1 
         AND created_at > NOW() - INTERVAL '1 hour'
       LIMIT 1`,
      ['Informasi Banjir Terbaru']
    );
    if (cekJam.rows.length > 0) {
      console.log('[BANJIR][CRON] Notifikasi banjir sudah dikirim dalam 1 jam terakhir, skip.');
      return;
    }

    console.log('[BANJIR][FCM] Akan mengirim notifikasi...');
    await sendFcmTopicNotification(
      'peringatan-umum',
      'Informasi Banjir Terbaru',
      deskripsi,
      { wilayah_banjir }
    );
    console.log('[BANJIR][FCM] Selesai kirim notifikasi');
    
    // OPSI: Pilih salah satu untuk menghindari duplikasi
    // Opsi 1: Kirim FCM saja (hapus bagian Twilio di bawah)
    // Opsi 2: Kirim Twilio saja (hapus bagian FCM di atas)
    // Opsi 3: Kirim keduanya dengan delay (seperti sekarang)
    
    // Kontrol via environment variable
    const NOTIFICATION_MODE = process.env.NOTIFICATION_MODE || 'both'; // 'fcm', 'twilio', 'both'
    
    if (NOTIFICATION_MODE === 'fcm') {
      console.log('[BANJIR][SKIP] Skip Twilio karena NOTIFICATION_MODE=fcm');
      return;
    }
    
    // Delay 2 detik sebelum kirim WhatsApp untuk menghindari duplikasi
    console.log('[BANJIR][DELAY] Menunggu 2 detik sebelum kirim WhatsApp...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Kirim WhatsApp ke semua user
    console.log('[BANJIR][TWILIO] Akan mengirim WhatsApp...');
    await kirimWhatsappKeSemuaUser(deskripsi);
    console.log('[BANJIR][TWILIO] Selesai mengirim WhatsApp');
    
    await pool.query(
      'INSERT INTO sigab_app.notifikasi (judul, pesan, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT DO NOTHING',
      ['Informasi Banjir Terbaru', deskripsi]
    );
    console.log('[BANJIR][DB] Notifikasi berhasil disimpan ke database');
  } catch (error) {
    console.error('[BANJIR][CRON][ERROR]', error.message);
  } finally {
    isJobRunning = false; // Selalu lepaskan lock, baik sukses maupun error
  }
}

module.exports = { kirimNotifikasiBanjirTerbaru };