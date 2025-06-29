# SIGAB User Backend API

Backend API untuk aplikasi SIGAB (Sistem Informasi Geografis Banjir) dengan fitur notifikasi real-time dan offline support.

## Fitur Notifikasi Offline - Smart Collapsible System

Sistem notifikasi telah diperbaiki untuk mendukung pengiriman **multiple notifications** ke device yang offline. Ketika device kembali online, **semua notifikasi yang terlewat** akan otomatis diterima.

### Masalah Sebelumnya:
- **FCM hanya menyimpan notifikasi terbaru** untuk device offline
- **Device online hanya menerima 1 notifikasi** saat kembali online
- **Topic messaging tidak menyimpan** notifikasi untuk offline
- **Hybrid approach masih terbatas** oleh FCM storage

### Solusi Smart Collapsible System:

**1. Extended TTL** - FCM menyimpan notifikasi selama 7 hari (bukan 24 jam)
**2. Smart Collapse Keys** - Grouping berdasarkan type dan timestamp (5 menit)
**3. Manual Resend** - Endpoint untuk kirim ulang notifikasi terlewat dari tabel existing
**4. No Additional Tables** - Menggunakan tabel notifikasi yang sudah ada
**5. Unique Tracking** - Setiap notifikasi memiliki ID unik

### Cara Kerja Smart Collapsible:

```javascript
// 1. Kirim ke topic untuk device online (immediate delivery)
await sendFcmTopicNotification('peringatan-umum', title, body, data);

// 2. Kirim ke individual tokens dengan smart collapse key
const collapseKey = `${data.type || 'general'}_${Math.floor(Date.now() / (5 * 60 * 1000))}`;
await sendFcmCollapsibleNotification(token, title, body, data, collapseKey);
```

### Keuntungan Smart Collapsible:

✅ **Extended TTL** - FCM menyimpan notifikasi selama 7 hari  
✅ **Smart grouping** - Notifikasi dikelompokkan per 5 menit berdasarkan type  
✅ **No additional tables** - Tidak perlu tabel database tambahan  
✅ **Manual resend** - Bisa kirim ulang notifikasi terlewat dari tabel existing  
✅ **Unique tracking** - Setiap notifikasi memiliki ID unik untuk tracking  
✅ **Immediate delivery** - Device online menerima notifikasi langsung  

### Endpoints Notifikasi

#### Register FCM Token
```http
POST /api/register-fcm-token
Content-Type: application/json

{
  "token": "fcm_token_here"
}
```

#### Subscribe ke Topic
```http
POST /api/subscribe-topic
Content-Type: application/json

{
  "token": "fcm_token_here",
  "topic": "peringatan-umum"
}
```

#### Test Token FCM
```http
POST /api/test-fcm-token
Content-Type: application/json

{
  "token": "fcm_token_here"
}
```

#### Test FCM Smart Collapsible (Recommended)
```http
POST /api/test-fcm-smart-collapsible
```

#### Test FCM Hybrid
```http
POST /api/test-fcm-hybrid
```

#### Test FCM Sederhana
```http
POST /api/test-fcm-simple
```

#### Resend Missed Notifications (Smart Collapsible)
```http
POST /api/resend-missed-notifications
Content-Type: application/json

{
  "token": "fcm_token_here",
  "last_seen_at": "2024-01-01T00:00:00Z" // optional
}
```

#### Get Notification Stats
```http
GET /api/notification-stats
```

#### Cleanup Invalid Tokens
```http
POST /api/cleanup-invalid-tokens
```

#### Get FCM Token Stats
```http
GET /api/fcm-token-stats
```

#### Kirim Notifikasi Manual (Testing)
```http
POST /api/send-manual-notification
Content-Type: application/json

{
  "title": "Judul Notifikasi",
  "body": "Isi pesan notifikasi",
  "data": {
    "type": "test",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

#### Ambil Riwayat Notifikasi
```http
GET /api/notification-history?installed_at=2024-01-01T00:00:00Z
```

### Testing Notifikasi Offline dengan Smart Collapsible

1. **Register Device**: Pastikan device terdaftar dengan FCM token
2. **Test Smart Collapsible**: Gunakan endpoint smart collapsible untuk memastikan sistem bekerja
3. **Matikan Internet**: Putuskan koneksi internet device
4. **Kirim Beberapa Notifikasi**: Gunakan cron job atau endpoint manual
5. **Hidupkan Internet**: Kembalikan koneksi internet
6. **Cek Notifikasi**: Device akan menerima SEMUA notifikasi yang terlewat
7. **Manual Resend**: Jika ada yang terlewat, gunakan endpoint resend

### Resend Missed Notifications (Smart Collapsible)

Ketika device kembali online, gunakan endpoint ini untuk mengirim ulang notifikasi yang terlewat dari tabel existing:

```javascript
// Frontend implementation
const resendMissedNotifications = async (token, lastSeenAt) => {
  try {
    const response = await fetch('/api/resend-missed-notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: token,
        last_seen_at: lastSeenAt // timestamp terakhir device online
      })
    });
    
    const result = await response.json();
    console.log('Resend result:', result);
    
    if (result.data.sent > 0) {
      console.log(`Received ${result.data.sent} missed notifications from existing table`);
    }
  } catch (error) {
    console.error('Error resending notifications:', error);
  }
};
```

### Troubleshooting FCM Errors

#### Error 400 - Invalid JSON Payload
Jika Anda melihat error seperti ini:
```
[FCM ERROR] Status: 400, Data: {
  error: {
    code: 400,
    message: "Invalid JSON payload received. Unknown name 'priority' at 'message.android.notification': Cannot find field.",
    status: 'INVALID_ARGUMENT'
  }
}
```

**Solusi:**
1. **Gunakan endpoint test smart collapsible**:
   ```bash
   curl -X POST http://localhost:3000/api/test-fcm-smart-collapsible
   ```

2. **Restart server** untuk menerapkan perbaikan payload FCM

3. **Cek log** untuk memastikan tidak ada error payload

#### Error 400 - Invalid Token
Jika Anda melihat error seperti ini:
```
[FCM ERROR] Token: xxx Request failed with status code 400
```

**Solusi:**
1. **Test token individual**:
   ```bash
   curl -X POST http://localhost:3000/api/test-fcm-token \
     -H "Content-Type: application/json" \
     -d '{"token": "your_token_here"}'
   ```

2. **Cleanup invalid tokens**:
   ```bash
   curl -X POST http://localhost:3000/api/cleanup-invalid-tokens
   ```

3. **Cek statistik tokens**:
   ```bash
   curl http://localhost:3000/api/fcm-token-stats
   ```

#### Penyebab Error 400:
- **Token expired**: Token FCM kadaluarsa
- **App uninstalled**: Aplikasi dihapus dari device
- **Invalid format**: Format token tidak valid
- **Wrong project**: Token dari project Firebase yang berbeda
- **Invalid payload**: Struktur payload FCM tidak sesuai

#### Automatic Cleanup
Sistem akan otomatis membersihkan token invalid setiap hari jam 2 pagi.

### Environment Variables

Tambahkan variabel berikut di file `.env`:

```env
# Firebase Server Key (untuk topic subscription)
FIREBASE_SERVER_KEY=YOUR_FIREBASE_SERVER_KEY_HERE
```

### Cara Mendapatkan Firebase Server Key

1. Buka [Firebase Console](https://console.firebase.google.com/)
2. Pilih project Anda
3. Buka **Project Settings** > **Cloud Messaging**
4. Salin **Server key** dari bagian **Project credentials**

## Setup dan Instalasi

```bash
npm install
npm start
```

## Struktur Database

### Tabel FCM Tokens
```sql
CREATE TABLE sigab_app.fcm_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tabel Notifikasi
```sql
CREATE TABLE sigab_app.notifikasi (
    id_notifikasi SERIAL PRIMARY KEY,
    judul VARCHAR(255) NOT NULL,
    pesan TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Monitoring dan Logs

### Log FCM Smart Collapsible
- `[FCM SMART COLLAPSIBLE] Topic: SUCCESS/FAILED, Individual: X sent, Y failed, Z invalid removed, TTL: 7 days` - Statistik smart collapsible
- `[RESEND EXISTING] Sent: X, Failed: Y notifications to token: Z` - Log pengiriman ulang notifikasi
- `[FCM CLEANUP]` - Log cleanup token invalid
- `[FCM ERROR]` - Error detail untuk debugging

### Cron Jobs
- **Notifikasi Banjir**: Setiap 10 detik
- **Notifikasi Cuaca**: Setiap 15 detik  
- **Notifikasi Laporan**: Setiap 12 detik
- **Cleanup Tokens**: Setiap hari jam 2 pagi

### Quick Test Commands

```bash
# Test FCM smart collapsible (recommended)
curl -X POST http://localhost:3000/api/test-fcm-smart-collapsible

# Test FCM hybrid
curl -X POST http://localhost:3000/api/test-fcm-hybrid

# Test FCM sederhana
curl -X POST http://localhost:3000/api/test-fcm-simple

# Cek statistik notifikasi
curl http://localhost:3000/api/notification-stats

# Cek statistik token
curl http://localhost:3000/api/fcm-token-stats

# Cleanup token invalid
curl -X POST http://localhost:3000/api/cleanup-invalid-tokens

# Resend missed notifications (contoh)
curl -X POST http://localhost:3000/api/resend-missed-notifications \
  -H "Content-Type: application/json" \
  -d '{"token": "your_token_here"}'
```

### Keuntungan Smart Collapsible System

✅ **Extended TTL** - FCM menyimpan notifikasi selama 7 hari  
✅ **Smart grouping** - Notifikasi dikelompokkan per 5 menit berdasarkan type  
✅ **No additional tables** - Tidak perlu tabel database tambahan  
✅ **Manual resend** - Bisa kirim ulang notifikasi terlewat dari tabel existing  
✅ **Unique tracking** - Setiap notifikasi memiliki ID unik untuk tracking  
✅ **Immediate delivery** - Device online menerima notifikasi langsung  
✅ **Rate limiting** - Delay antar pengiriman untuk menghindari throttling  
✅ **Automatic cleanup** - Token invalid dibersihkan otomatis 