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

// Fungsi untuk memformat data untuk FCM (semua nilai harus string)
function formatFcmData(data) {
  const formattedData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) {
      formattedData[key] = String(value);
    }
  }
  return formattedData;
}

// Fungsi untuk kirim notifikasi ke token spesifik (disimpan untuk device offline)
async function sendFcmNotification(token, title, body, data = {}) {
  try {
    const accessToken = await getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

    // Format data untuk FCM
    const formattedData = formatFcmData(data);

    const message = {
      message: {
        token,
        notification: { 
          title, 
          body 
        },
        data: formattedData,
        android: {
          priority: 'high'
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
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
      timeout: 10000 // 10 second timeout
    });

    return response.data;
  } catch (error) {
    // Log detailed error information
    if (error.response) {
      console.error(`[FCM ERROR] Status: ${error.response.status}, Data:`, error.response.data);
      
      // Handle specific FCM errors
      if (error.response.status === 400) {
        if (error.response.data?.error?.details?.[0]?.errorCode === 'INVALID_ARGUMENT') {
          throw new Error('Invalid token or message format');
        } else if (error.response.data?.error?.details?.[0]?.errorCode === 'UNREGISTERED') {
          throw new Error('Token is unregistered');
        }
      } else if (error.response.status === 404) {
        throw new Error('Token not found');
      }
    }
    throw error;
  }
}

// Fungsi untuk subscribe token ke topic
async function subscribeToTopic(token, topic) {
  try {
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
      timeout: 10000
    });

    return response.data;
  } catch (error) {
    console.error(`[FCM SUBSCRIBE ERROR] Token: ${token}, Topic: ${topic}`, error.message);
    throw error;
  }
}

// Fungsi untuk kirim notifikasi dengan hybrid approach (topic + individual untuk offline)
async function sendFcmHybridNotification(title, body, data = {}) {
  const pool = require('../config/database');
  
  // Generate unique notification ID
  const notificationId = Date.now().toString();
  const enhancedData = {
    ...data,
    notification_id: notificationId,
    timestamp: new Date().toISOString(),
    delivery_method: 'hybrid'
  };

  let topicSuccess = false;
  let individualSuccess = 0;
  let individualFailed = 0;
  const invalidTokens = [];

  // 1. Kirim ke topic untuk device online (immediate delivery)
  try {
    await sendFcmTopicNotification('peringatan-umum', title, body, enhancedData);
    topicSuccess = true;
    console.log('[FCM HYBRID] Topic notification sent successfully');
  } catch (topicError) {
    console.error('[FCM HYBRID] Topic notification failed:', topicError.message);
  }

  // 2. Kirim ke individual tokens untuk offline storage
  const { rows } = await pool.query('SELECT token FROM sigab_app.fcm_tokens WHERE token IS NOT NULL');
  const tokens = rows.map(r => r.token);

  for (const token of tokens) {
    try {
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await sendFcmNotification(token, title, body, enhancedData);
      individualSuccess++;
    } catch (error) {
      individualFailed++;
      
      if (error.message.includes('unregistered') || error.message.includes('not found')) {
        invalidTokens.push(token);
      }
      
      console.error(`[FCM HYBRID] Individual notification failed for token: ${token}`, error.message);
    }
  }

  // Remove invalid tokens
  if (invalidTokens.length > 0) {
    try {
      await pool.query(
        'DELETE FROM sigab_app.fcm_tokens WHERE token = ANY($1::text[])',
        [invalidTokens]
      );
      console.log(`[FCM HYBRID] Removed ${invalidTokens.length} invalid tokens`);
    } catch (dbError) {
      console.error('[FCM HYBRID] Error removing invalid tokens:', dbError.message);
    }
  }

  console.log(`[FCM HYBRID] Topic: ${topicSuccess ? 'SUCCESS' : 'FAILED'}, Individual: ${individualSuccess} sent, ${individualFailed} failed, ${invalidTokens.length} invalid removed`);
  
  return {
    topicSuccess,
    individualSuccess,
    individualFailed,
    invalidTokens,
    notificationId
  };
}

// Fungsi untuk kirim notifikasi ke semua token terdaftar (untuk offline support)
async function sendFcmToAllTokens(title, body, data = {}) {
  const pool = require('../config/database');
  const { rows } = await pool.query('SELECT token FROM sigab_app.fcm_tokens WHERE token IS NOT NULL');
  const tokens = rows.map(r => r.token);
  
  let success = 0, fail = 0;
  const results = [];
  const invalidTokens = [];

  for (const token of tokens) {
    try {
      await sendFcmNotification(token, title, body, data);
      success++;
      results.push({ token, status: 'success' });
    } catch (error) {
      fail++;
      results.push({ token, status: 'failed', error: error.message });
      
      // Check if token is invalid and should be removed
      if (error.message.includes('unregistered') || error.message.includes('not found')) {
        invalidTokens.push(token);
      }
      
      console.error(`[FCM ERROR] Token: ${token}`, error.message);
    }
  }

  // Remove invalid tokens from database
  if (invalidTokens.length > 0) {
    try {
      await pool.query(
        'DELETE FROM sigab_app.fcm_tokens WHERE token = ANY($1::text[])',
        [invalidTokens]
      );
      console.log(`[FCM] Removed ${invalidTokens.length} invalid tokens from database`);
    } catch (dbError) {
      console.error('[FCM] Error removing invalid tokens:', dbError.message);
    }
  }

  console.log(`[FCM] Sent: ${success}, Failed: ${fail}, Invalid tokens removed: ${invalidTokens.length}`);
  return { success, fail, results, invalidTokens };
}

async function sendFcmTopicNotification(topic, title, body, data = {}) {
  try {
    const accessToken = await getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

    // Format data untuk FCM
    const formattedData = formatFcmData(data);

    const message = {
      message: {
        topic,
        notification: { 
          title, 
          body 
        },
        data: formattedData,
        android: {
          priority: 'high'
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
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
      timeout: 10000
    });

    return response.data;
  } catch (error) {
    console.error(`[FCM TOPIC ERROR] Topic: ${topic}`, error.message);
    if (error.response) {
      console.error(`[FCM TOPIC ERROR] Status: ${error.response.status}, Data:`, error.response.data);
    }
    throw error;
  }
}

// Fungsi untuk membersihkan token invalid secara otomatis
async function cleanupInvalidTokens() {
  const pool = require('../config/database');
  const { rows } = await pool.query('SELECT token FROM sigab_app.fcm_tokens WHERE token IS NOT NULL');
  const tokens = rows.map(r => r.token);
  
  let validTokens = [];
  let invalidTokens = [];
  
  console.log(`[FCM CLEANUP] Checking ${tokens.length} tokens...`);
  
  for (const token of tokens) {
    try {
      // Kirim test notification dengan timeout pendek
      await sendFcmNotification(
        token, 
        'Token Validation', 
        'Validasi token FCM',
        { type: 'validation' }
      );
      validTokens.push(token);
    } catch (error) {
      if (error.message.includes('unregistered') || 
          error.message.includes('not found') || 
          error.message.includes('Invalid token')) {
        invalidTokens.push(token);
      }
    }
  }
  
  // Remove invalid tokens
  if (invalidTokens.length > 0) {
    try {
      await pool.query(
        'DELETE FROM sigab_app.fcm_tokens WHERE token = ANY($1::text[])',
        [invalidTokens]
      );
      console.log(`[FCM CLEANUP] Removed ${invalidTokens.length} invalid tokens`);
    } catch (dbError) {
      console.error('[FCM CLEANUP] Error removing invalid tokens:', dbError.message);
    }
  }
  
  console.log(`[FCM CLEANUP] Valid: ${validTokens.length}, Invalid removed: ${invalidTokens.length}`);
  return { validTokens, invalidTokens };
}

module.exports = { 
  sendFcmTopicNotification, 
  sendFcmNotification, 
  sendFcmToAllTokens,
  sendFcmHybridNotification,
  subscribeToTopic,
  cleanupInvalidTokens
};