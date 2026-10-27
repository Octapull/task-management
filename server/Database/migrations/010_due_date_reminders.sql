-- 010 - Teslim tarihi hatırlatmaları.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.

-- Hangi hatırlatmanın gönderildiği.
--
--   0 = hiç gönderilmedi
--   1 = "yaklaşıyor" gönderildi
--   2 = "geçti" gönderildi
--
-- Ayrı bir tablo yerine tek sütun: bir işin hatırlatma zinciri tek yönlü
-- ilerliyor ve geri dönüşü yok. Sıfırlama, teslim tarihi değiştiğinde ya da
-- iş yeniden havuza döndüğünde yapılıyor.
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS reminder_stage SMALLINT NOT NULL DEFAULT 0;

-- Tarama sorgusu bu üç sütun üzerinden filtreliyor.
CREATE INDEX IF NOT EXISTS ix_tasks_due_reminder
    ON tasks (due_date, reminder_stage)
    WHERE due_date IS NOT NULL;

-- Teslim tarihi hatırlatması istiyor mu?
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notify_on_due_date BOOLEAN NOT NULL DEFAULT TRUE;
