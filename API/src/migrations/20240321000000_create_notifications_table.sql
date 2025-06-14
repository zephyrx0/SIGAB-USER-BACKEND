-- Create notifications table
CREATE TABLE IF NOT EXISTS sigab_app.notifikasi (
    id_notifikasi SERIAL PRIMARY KEY,
    judul VARCHAR(255) NOT NULL,
    pesan TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifikasi_created_at ON sigab_app.notifikasi(created_at); 