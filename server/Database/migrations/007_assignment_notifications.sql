-- 007 - Atama bildirimi tercihi.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.

-- Kullanıcıya bir iş atandığında e-posta gitsin mi?
--
-- Varsayılan TRUE: bildirim özelliğin asıl değeri, kapalı başlarsa kimse
-- açmayı akıl etmez. Rahatsız olan profil ekranından kapatabiliyor.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notify_on_assignment BOOLEAN NOT NULL DEFAULT TRUE;
