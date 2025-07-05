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

// Fungsi untuk kirim notifikasi ke token spesifik (standar)
async function sendFcmNotification(token, title, body, data = {}) {
  try {
    const accessToken = await getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

    // Hapus key title/body dari data jika ada
    const { title: _t, body: _b, ...cleanData } = formatFcmData(data);

    const message = {
      message: {
        token,
        notification: {
          title,
          body
        },
        data: cleanData,
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

  // 1. Kirim ke topic untuk device online (immediate delivery) dengan collapsible key
  try {
    // Gunakan collapsible key untuk topic notification
    const topicCollapseKey = `topic_${data.type || 'general'}_${Math.floor(Date.now() / (5 * 60 * 1000))}`; // Group per 5 menit
    
    const accessToken = await getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

    const { title: _t, body: _b, ...cleanData } = formatFcmData(enhancedData);

    const message = {
      message: {
        topic: 'peringatan-umum',
        notification: {
          title,
          body
        },
        data: cleanData,
        android: {
          priority: 'high',
          collapse_key: topicCollapseKey,
          ttl: '604800s' // 7 hari TTL
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          },
          headers: {
            'apns-collapse-id': topicCollapseKey
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
    
    topicSuccess = true;
    console.log('[FCM HYBRID] Topic notification sent successfully with collapse key:', topicCollapseKey);
  } catch (topicError) {
    console.error('[FCM HYBRID] Topic notification failed:', topicError.message);
  }

  // 2. Kirim ke individual tokens untuk offline storage dengan collapsible key
  const { rows } = await pool.query('SELECT token FROM sigab_app.fcm_tokens WHERE token IS NOT NULL');
  const tokens = rows.map(r => r.token);

  for (const token of tokens) {
    try {
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Gunakan collapsible key untuk individual notification
      const individualCollapseKey = `individual_${data.type || 'general'}_${Math.floor(Date.now() / (5 * 60 * 1000))}`;
      
      await sendFcmCollapsibleNotification(token, title, body, enhancedData, individualCollapseKey);
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

  console.log(`[FCM HYBRID] Topic: ${topicSuccess ? 'SUCCESS' : 'FAILED'}, Individual: ${individualSuccess} sent, ${individualFailed} failed, ${invalidTokens.length} invalid removed, Collapsible: enabled`);
  
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

// Fungsi untuk kirim notifikasi ke topic (standar)
async function sendFcmTopicNotification(topic, title, body, data = {}) {
  try {
    const accessToken = await getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

    // Hapus key title/body dari data jika ada
    const { title: _t, body: _b, ...cleanData } = formatFcmData(data);

    const message = {
      message: {
        topic,
        notification: {
          title,
          body
        },
        data: cleanData,
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

// Fungsi untuk kirim notifikasi dengan collapsible key (standar)
async function sendFcmCollapsibleNotification(token, title, body, data = {}, collapseKey = 'default') {
  try {
    const accessToken = await getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

    // Hapus key title/body dari data jika ada
    const { title: _t, body: _b, ...cleanData } = formatFcmData(data);

    const message = {
      message: {
        token,
        notification: {
          title,
          body
        },
        data: cleanData,
        android: {
          priority: 'high',
          collapse_key: collapseKey,
          ttl: '604800s' // 7 hari TTL untuk offline storage yang lebih lama
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          },
          headers: {
            'apns-collapse-id': collapseKey
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
    if (error.response) {
      console.error(`[FCM COLLAPSIBLE ERROR] Status: ${error.response.status}, Data:`, error.response.data);
      
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

// Fungsi untuk kirim notifikasi dengan smart collapsible (tanpa database tambahan)
async function sendFcmSmartCollapsible(title, body, data = {}) {
  const pool = require('../config/database');
  
  // Generate unique notification ID
  const notificationId = Date.now().toString();
  const enhancedData = {
    ...data,
    notification_id: notificationId,
    timestamp: new Date().toISOString(),
    delivery_method: 'smart_collapsible'
  };

  let topicSuccess = false;
  let individualSuccess = 0;
  let individualFailed = 0;
  const invalidTokens = [];

  // 1. Kirim ke topic untuk device online (immediate delivery)
  try {
    await sendFcmTopicNotification('peringatan-umum', title, body, enhancedData);
    topicSuccess = true;
    console.log('[FCM SMART COLLAPSIBLE] Topic notification sent successfully');
  } catch (topicError) {
    console.error('[FCM SMART COLLAPSIBLE] Topic notification failed:', topicError.message);
  }

  // AGGRESIVE DEDUPLICATION - Database level check sebelum kirim individual
  if (data.type === 'cuaca') {
    const recentCheck = await pool.query(
      `SELECT 1 FROM sigab_app.notifikasi 
       WHERE judul = 'Peringatan Dini Cuaca'
       AND created_at >= NOW() - INTERVAL '30 minutes'
       LIMIT 1`,
      []
    );
    if (recentCheck.rows.length > 0) {
      console.log('[FCM SMART COLLAPSIBLE] AGGRESIVE DEDUP: Recent cuaca notification found, skipping individual sends');
      return {
        topicSuccess,
        individualSuccess: 0,
        individualFailed: 0,
        invalidTokens: [],
        notificationId
      };
    }
  }

  // 2. Kirim ke individual tokens dengan smart collapse key dan rate limiting
  const { rows } = await pool.query('SELECT token FROM sigab_app.fcm_tokens WHERE token IS NOT NULL');
  const tokens = rows.map(r => r.token);

  // AGGRESIVE RATE LIMITING - Kirim maksimal 10 token per batch dengan delay
  const batchSize = 10;
  const delayBetweenBatches = 2000; // 2 detik delay antar batch
  
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    
    // Process batch secara parallel dengan delay
    const batchPromises = batch.map(async (token, index) => {
      try {
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100 + (index * 50)));
        
        // Smart collapse key berdasarkan type dan timestamp untuk grouping yang lebih baik
        // Untuk notifikasi cuaca, gunakan collapse key yang lebih agresif (per jam)
        let collapseKey;
        if (data.type === 'cuaca') {
          // Collapse key yang sangat agresif untuk cuaca - per jam dengan timestamp
          const hour = Math.floor(Date.now() / (60 * 60 * 1000));
          const day = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
          collapseKey = `cuaca_${day}_${hour}`; // Group per jam untuk cuaca
        } else {
          // Collapse key yang lebih ketat untuk notifikasi lainnya - per 2 menit
          collapseKey = `${data.type || 'general'}_${Math.floor(Date.now() / (2 * 60 * 1000))}`; // Group per 2 menit
        }
        
        await sendFcmCollapsibleNotification(token, title, body, enhancedData, collapseKey);
        return { token, status: 'success' };
      } catch (error) {
        if (error.message.includes('unregistered') || error.message.includes('not found')) {
          invalidTokens.push(token);
        }
        
        console.error(`[FCM SMART COLLAPSIBLE] Individual notification failed for token: ${token}`, error.message);
        return { token, status: 'failed', error: error.message };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // Count successes and failures
    batchResults.forEach(result => {
      if (result.status === 'success') {
        individualSuccess++;
      } else {
        individualFailed++;
      }
    });
    
    // Add delay between batches
    if (i + batchSize < tokens.length) {
      console.log(`[FCM SMART COLLAPSIBLE] Batch ${Math.floor(i/batchSize) + 1} completed, waiting ${delayBetweenBatches}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  // Remove invalid tokens
  if (invalidTokens.length > 0) {
    try {
      await pool.query(
        'DELETE FROM sigab_app.fcm_tokens WHERE token = ANY($1::text[])',
        [invalidTokens]
      );
      console.log(`[FCM SMART COLLAPSIBLE] Removed ${invalidTokens.length} invalid tokens`);
    } catch (dbError) {
      console.error('[FCM SMART COLLAPSIBLE] Error removing invalid tokens:', dbError.message);
    }
  }

  console.log(`[FCM SMART COLLAPSIBLE] Topic: ${topicSuccess ? 'SUCCESS' : 'FAILED'}, Individual: ${individualSuccess} sent, ${individualFailed} failed, ${invalidTokens.length} invalid removed, TTL: 7 days`);
  
  return {
    topicSuccess,
    individualSuccess,
    individualFailed,
    invalidTokens,
    notificationId
  };
}

// Fungsi untuk kirim ulang notifikasi dari tabel notifikasi yang sudah ada
async function resendNotificationsFromExistingTable(token, lastSeenAt = null) {
  const pool = require('../config/database');
  
  try {
    let query = `
      SELECT id_notifikasi, judul, pesan, created_at 
      FROM sigab_app.notifikasi 
      WHERE created_at > $1
      ORDER BY created_at ASC
      LIMIT 20
    `;
    
    const cutoffTime = lastSeenAt || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default 7 hari yang lalu
    const { rows } = await pool.query(query, [cutoffTime]);
    
    if (rows.length === 0) {
      return { sent: 0, message: 'No missed notifications found' };
    }
    
    let sent = 0;
    let failed = 0;
    
    for (const notification of rows) {
      try {
        const data = {
          notification_id: notification.id_notifikasi.toString(),
          type: 'missed_notification',
          timestamp: notification.created_at.toISOString(),
          source: 'resend_from_existing_table'
        };
        
        // Smart collapse key untuk resend
        const collapseKey = `resend_${Math.floor(notification.created_at.getTime() / (5 * 60 * 1000))}`;
        
        await sendFcmCollapsibleNotification(
          token, 
          notification.judul, 
          notification.pesan, 
          data, 
          collapseKey
        );
        sent++;
        
        // Add delay between notifications
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        failed++;
        console.error(`[RESEND EXISTING] Failed to resend notification ${notification.id_notifikasi}:`, error.message);
      }
    }
    
    console.log(`[RESEND EXISTING] Sent: ${sent}, Failed: ${failed} notifications to token: ${token}`);
    return { sent, failed, total: rows.length };
    
  } catch (error) {
    console.error('[RESEND EXISTING] Error:', error.message);
    throw error;
  }
}

module.exports = { 
  sendFcmTopicNotification, 
  sendFcmNotification, 
  sendFcmToAllTokens,
  sendFcmHybridNotification,
  subscribeToTopic,
  cleanupInvalidTokens,
  sendFcmCollapsibleNotification,
  sendFcmSmartCollapsible,
  resendNotificationsFromExistingTable
};