const pool = require('../config/database');
const { sendFcmTopicNotification } = require('./fcm');

// Fungsi untuk kirim notifikasi peringatan banjir terbaru
async function kirimNotifikasiBanjirTerbaru() {
  const result = await pool.query(
    'SELECT wilayah_banjir FROM sigab_app.informasi_banjir'
  );
  if (result.rows.length === 0) return;
  const { lokasi } = result.rows[0];
  const deskripsi = `Peringatan banjir di ${wilayah_banjir}. Mohon waspada!`;
  await sendFcmTopicNotification(
    'peringatan-banjir',
    'Peringatan Banjir',
    deskripsi,
    { lokasi }
  );
}

module.exports = { kirimNotifikasiBanjirTerbaru }; 