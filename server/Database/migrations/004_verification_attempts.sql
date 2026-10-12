-- 004 - Doğrulama kodunda deneme sayacı.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.

-- Kaç kez yanlış kod girildi?
--
-- 6 haneli kodun bir milyon olasılığı var; ömrü 10 dakika ve yeniden gönderme
-- 60 saniyede bir. Bu üçü tek başına kaba kuvvet denemesini zorlaştırıyor ama
-- engellemiyor: sayaç dolduğunda kod tamamen iptal ediliyor ve kullanıcı yeni
-- kod istemek zorunda kalıyor.
ALTER TABLE email_verifications
    ADD COLUMN IF NOT EXISTS attempts SMALLINT NOT NULL DEFAULT 0;
