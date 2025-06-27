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

async function sendFcmNotification(token, title, body, data = {}) {
  const accessToken = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

  const message = {
    message: {
      token,
      notification: { title, body },
      data,
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

// async function sendFcmTopicNotification(topic, title, body, data = {}) {
//   const accessToken = await getAccessToken();
//   const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

//   const message = {
//     message: {
//       topic,
//       notification: { title, body },
//       data,
//     },
//   };

//   const response = await axios.post(url, message, {
//     headers: {
//       'Authorization': `Bearer ${accessToken}`,
//       'Content-Type': 'application/json',
//     },
//   });

//   return response.data;
// }

module.exports = { sendFcmNotification, sendFcmTopicNotification };