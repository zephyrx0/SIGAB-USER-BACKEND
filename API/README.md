# Tambahkan Unique Constraint pada Tabel Notifikasi

Untuk mencegah duplikasi notifikasi (judul, pesan, tanggal sama) pada tabel sigab_app.notifikasi, jalankan perintah berikut di database:

```sql
ALTER TABLE sigab_app.notifikasi
ADD CONSTRAINT unique_notif_per_hari UNIQUE (judul, pesan, created_at::date);
```

Setelah constraint ini ditambahkan, query insert dengan ON CONFLICT DO NOTHING akan mencegah duplikasi notifikasi. 