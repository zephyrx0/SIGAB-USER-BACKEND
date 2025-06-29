const twilio = require('twilio');
const pool = require('../config/database');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappSender = process.env.TWILIO_WHATSAPP_SENDER;

const client = twilio(accountSid, authToken);

async function kirimWhatsappKeSemuaUser(pesan) {
  const { rows } = await pool.query('SELECT nomor_wa FROM sigab_app.user_app WHERE nomor_wa IS NOT NULL');
  for (const user of rows) {
    let nomor = user.nomor_wa;
    if (!nomor) continue;
    // Normalisasi nomor: ganti 0 di depan dengan 62
    let nomorWa = nomor;
    if (nomorWa.startsWith('0')) {
      nomorWa = '62' + nomorWa.slice(1);
    }
    try {
      await client.messages.create({
        from: whatsappSender,
        to: `whatsapp:${nomorWa}`,
        body: pesan,
      });
      console.log(`[TWILIO] WhatsApp sent to ${nomorWa}`);
    } catch (e) {
      console.error(`[TWILIO] Failed to send to ${nomorWa}:`, e.message);
    }
  }
}

module.exports = { kirimWhatsappKeSemuaUser };