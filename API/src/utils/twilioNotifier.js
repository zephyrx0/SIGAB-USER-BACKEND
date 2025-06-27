const twilio = require('twilio');
const pool = require('../config/database');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappSender = process.env.TWILIO_WHATSAPP_SENDER;

const client = twilio(accountSid, authToken);

// Fungsi untuk mengkonversi nomor lokal ke format internasional
function formatNomorInternasional(nomor) {
  // Hapus spasi dan karakter khusus
  let cleanNomor = nomor.replace(/\s+/g, '').replace(/[^\d]/g, '');
  
  // Jika sudah format internasional (+62), return as is
  if (cleanNomor.startsWith('+62')) {
    return cleanNomor;
  }
  
  // Jika dimulai dengan 62 (tanpa +), tambahkan +
  if (cleanNomor.startsWith('62')) {
    return '+' + cleanNomor;
  }
  
  // Jika dimulai dengan 0, ganti dengan +62
  if (cleanNomor.startsWith('0')) {
    return '+62' + cleanNomor.substring(1);
  }
  
  // Jika tidak ada prefix, asumsikan nomor Indonesia dan tambahkan +62
  return '+62' + cleanNomor;
}

async function kirimWhatsappKeSemuaUser(pesan) {
  const { rows } = await pool.query('SELECT nomor_wa FROM sigab_app.user_app WHERE nomor_wa IS NOT NULL');
  for (const user of rows) {
    const nomor = user.nomor_wa;
    if (!nomor) continue;
    
    try {
      // Konversi nomor ke format internasional
      const nomorInternasional = formatNomorInternasional(nomor);
      console.log(`[TWILIO] Mengirim ke ${nomor} (${nomorInternasional})`);
      
      await client.messages.create({
        from: whatsappSender,
        to: `whatsapp:${nomorInternasional}`,
        body: pesan,
      });
      console.log(`[TWILIO] WhatsApp sent to ${nomorInternasional}`);
    } catch (e) {
      console.error(`[TWILIO] Failed to send to ${nomor}:`, e.message);
    }
  }
}

module.exports = { kirimWhatsappKeSemuaUser };