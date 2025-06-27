const { sendFcmTopicNotification } = require('./fcm');
const axios = require('axios');

// Fungsi untuk kirim notifikasi peringatan dini cuaca
async function kirimNotifikasiCuaca() {
  // Ganti URL_API_CUACA dengan endpoint API cuaca asli kamu
  const response = await axios.get('URL_API_CUACA');
  const dataCuaca = response.data; // sesuaikan struktur data API kamu

  // Misal, ambil jam dan status cuaca
  const jam = dataCuaca.jam_perkiraan || 'segera';
  const deskripsi = `Peringatan dini: Hujan diperkirakan terjadi pada pukul ${jam}.`;

  await sendFcmTopicNotification(
    'peringatan-cuaca',
    'Peringatan Dini Cuaca',
    deskripsi,
    { jam, cuaca: 'Hujan' }
  );
}

module.exports = { kirimNotifikasiCuaca }; 