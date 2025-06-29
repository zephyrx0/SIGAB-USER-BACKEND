# SIGAB User Backend API

Backend API untuk aplikasi SIGAB (Sistem Informasi Geografis Banjir) dengan fitur notifikasi real-time.

## Fitur Notifikasi Offline

Sistem notifikasi telah diperbaiki untuk mendukung pengiriman notifikasi ke device yang offline. Ketika device kembali online, notifikasi yang terlewat akan otomatis diterima.

### Mekanisme Notifikasi Offline

1. **Hybrid Approach**: Menggunakan kombinasi Topic Messaging dan Individual Token Messaging
2. **Database Storage**: Semua notifikasi disimpan di database dengan timestamp
3. **FCM Offline Support**: FCM menyimpan notifikasi untuk device offline
4. **Automatic Retry**: FCM mengirim ulang notifikasi saat device online

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

#### Test FCM Sederhana (Recommended)
```http
POST /api/test-fcm-simple
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

### Testing Notifikasi Offline

1. **Register Device**: Pastikan device terdaftar dengan FCM token
2. **Matikan Internet**: Putuskan koneksi internet device
3. **Kirim Notifikasi**: Gunakan endpoint manual atau trigger notifikasi otomatis
4. **Hidupkan Internet**: Kembalikan koneksi internet
5. **Cek Notifikasi**: Device akan menerima notifikasi yang terlewat

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
1. **Gunakan endpoint test sederhana**:
   ```bash
   curl -X POST http://localhost:3000/api/test-fcm-simple
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

### Log FCM
- `[FCM] Sent: X, Failed: Y` - Statistik pengiriman notifikasi
- `[FCM CLEANUP]` - Log cleanup token invalid
- `[FCM ERROR]` - Error detail untuk debugging
- `[FCM TOPIC ERROR]` - Error untuk topic messaging

### Cron Jobs
- **Notifikasi Banjir**: Setiap 10 detik
- **Notifikasi Cuaca**: Setiap 15 detik  
- **Notifikasi Laporan**: Setiap 12 detik
- **Cleanup Tokens**: Setiap hari jam 2 pagi

### Quick Test Commands

```bash
# Test FCM sederhana (recommended)
curl -X POST http://localhost:3000/api/test-fcm-simple

# Cek statistik token
curl http://localhost:3000/api/fcm-token-stats

# Cleanup token invalid
curl -X POST http://localhost:3000/api/cleanup-invalid-tokens
```

# Tambahkan Unique Constraint pada Tabel Notifikasi

Untuk mencegah duplikasi notifikasi (judul, pesan, tanggal sama) pada tabel sigab_app.notifikasi, jalankan perintah berikut di database:

```sql
ALTER TABLE sigab_app.notifikasi
ADD CONSTRAINT unique_notif_per_hari UNIQUE (judul, pesan, created_at::date);
```

Setelah constraint ini ditambahkan, query insert dengan ON CONFLICT DO NOTHING akan mencegah duplikasi notifikasi. 