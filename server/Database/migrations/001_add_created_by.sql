-- 001 - İşi kimin oluşturduğunu saklamak için created_by sütunu.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı sütun schema.sql içinde de tanımlı.
--
-- Mevcut kayıtlarda created_by NULL kalır (kimin oluşturduğu bilinmiyor);
-- arayüz bu durumu "Bilinmiyor" olarak gösteriyor.

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id);

-- Panoda sık kullanılan filtreler için yardımcı indeksler.
CREATE INDEX IF NOT EXISTS ix_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS ix_tasks_assigned_user_id ON tasks (assigned_user_id);
