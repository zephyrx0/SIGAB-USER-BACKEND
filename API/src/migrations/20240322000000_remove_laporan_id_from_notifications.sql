-- Drop foreign key constraint first
ALTER TABLE IF EXISTS sigab_app.notifikasi
DROP CONSTRAINT IF EXISTS notifikasi_id_laporan_fkey;

-- Drop index
DROP INDEX IF EXISTS sigab_app.idx_notifikasi_id_laporan;

-- Drop column
ALTER TABLE IF EXISTS sigab_app.notifikasi
DROP COLUMN IF EXISTS id_laporan; 