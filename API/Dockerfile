# Tahap 1: Pilih Versi Node.js
# Gunakan base image resmi Node.js. Sangat disarankan menggunakan versi LTS (Long-Term Support).
# 'alpine' adalah versi yang lebih ringan, bagus untuk produksi.
# Ganti '20' dengan versi Node.js yang Anda gunakan (misal: 18, 22).
FROM node:20-alpine

# Tahap 2: Atur Lingkungan Kerja
# Membuat dan menetapkan direktori kerja di dalam container.
# Semua perintah selanjutnya akan dijalankan dari direktori ini.
WORKDIR /app

# Tahap 3: Instal Dependensi
# Salin file package.json dan package-lock.json terlebih dahulu.
# Ini memanfaatkan cache Docker. Jika file-file ini tidak berubah, Docker tidak akan menginstal ulang dependensi setiap kali.
COPY package*.json ./

# Jalankan 'npm clean-install'. Ini lebih cepat dan aman untuk produksi
# karena memastikan instalasi yang bersih sesuai dengan package-lock.json.
RUN npm ci

# Tahap 4: Salin Kode Aplikasi
# Salin semua file dan folder dari proyek Anda ke dalam direktori kerja (/app) di container.
COPY . .

# (OPSIONAL) Jika Anda menggunakan TypeScript
# Jika proyek Anda menggunakan TypeScript, Anda perlu menambahkan langkah untuk kompilasi.
# Hapus tanda '#' di bawah ini jika Anda menggunakan TypeScript.
# RUN npm run build

# Tahap 5: Ekspos Port
# Memberi tahu Docker bahwa container ini akan "mendengarkan" di port tertentu.
# Ganti '3000' dengan port yang digunakan oleh aplikasi Anda.
# Railway akan secara otomatis memetakan port ini ke port publik.
EXPOSE 3000

# Tahap 6: Jalankan Aplikasi
# Perintah untuk memulai aplikasi Anda saat container dijalankan.
# PASTIKAN untuk menyesuaikan ini:
# - Jika file utama Anda adalah index.js, ganti 'server.js' menjadi 'index.js'.
# - Jika Anda menggunakan TypeScript, Anda harus menjalankan file hasil kompilasi,
#   contohnya: CMD [ "node", "dist/index.js" ]
CMD [ "node", "server.js" ]