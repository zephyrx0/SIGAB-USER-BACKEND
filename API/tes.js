require('dotenv').config();
const key = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON).private_key;
console.log(key.split('\\n').join('\n'));
