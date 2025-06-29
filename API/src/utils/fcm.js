const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
const path = require('path');

// Ambil service account dari environment variable jika ada, jika tidak fallback ke file (untuk development lokal)
let serviceAccount;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  // Fix: convert \\n to real newlines
  if (serviceAccount.private_key && serviceAccount.private_key.includes('\\n')) {
    serviceAccount.private_key = serviceAccount.private_key.split('\\n').join('\n');
  }
} else {
  // fallback untuk development lokal
  serviceAccount = require(path.join(__dirname, '../../sigab-user-9878781f458a.json'));
}

const SCOPES = ['https://www.googleapis.com/auth/firebase.messaging'];
const PROJECT_ID = serviceAccount.project_id;

async function getAccessToken() {
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: SCOPES,
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  return accessToken.token;
}

// Fungsi untuk kirim notifikasi ke token spesifik (disimpan untuk device offline)
async function sendFcmNotification(token, title, body, data = {}) {
  const accessToken = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

  const message = {
    message: {
      token,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
        notification: {
          priority: 'high',
          default_sound: true,
          default_vibrate_timings: true,
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          }
        }
      }
    },
  };

  const response = await axios.post(url, message, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

// Fungsi untuk subscribe token ke topic
async function subscribeToTopic(token, topic) {
  const accessToken = await getAccessToken();
  const url = `https://iid.googleapis.com/iid/v1:batchAdd`;

  const response = await axios.post(url, {
    to: topic,
    registration_tokens: [token]
  }, {
    headers: {
      'Authorization': `key=${process.env.FIREBASE_SERVER_KEY || 'YOUR_SERVER_KEY'}`,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

// Fungsi untuk kirim notifikasi ke semua token terdaftar (untuk offline support)
async function sendFcmToAllTokens(title, body, data = {}) {
  const pool = require('../config/database');
  const { rows } = await pool.query('SELECT token FROM sigab_app.fcm_tokens WHERE token IS NOT NULL');
  const tokens = rows.map(r => r.token);
  
  let success = 0, fail = 0;
  const results = [];

  for (const token of tokens) {
    try {
      await sendFcmNotification(token, title, body, data);
      success++;
      results.push({ token, status: 'success' });
    } catch (error) {
      fail++;
      results.push({ token, status: 'failed', error: error.message });
      console.error(`[FCM ERROR] Token: ${token}`, error.message);
    }
  }

  console.log(`[FCM] Sent: ${success}, Failed: ${fail}`);
  return { success, fail, results };
}

async function sendFcmTopicNotification(topic, title, body, data = {}) {
  const accessToken = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

  const message = {
    message: {
      topic,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
        notification: {
          priority: 'high',
          default_sound: true,
          default_vibrate_timings: true,
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          }
        }
      }
    },
  };

  const response = await axios.post(url, message, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

module.exports = { 
  sendFcmTopicNotification, 
  sendFcmNotification, 
  sendFcmToAllTokens,
  subscribeToTopic 
};