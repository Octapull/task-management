-- 005 - Doğrulama kodunun amacı.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.

-- Aynı tablo iki farklı akışa hizmet ediyor: hesap doğrulama ve şifre
-- sıfırlama. Ayırt edici bir alan olmadan bir akış için üretilen kod diğerinde
-- kullanılabilirdi - şifre sıfırlama kodu istenip onunla hesap doğrulanabilir,
-- ya da tersi olabilirdi.
--
-- 0 = hesap doğrulama, 1 = şifre sıfırlama.
-- Varsayılan 0: bu satır eklenmeden önceki bütün kodlar hesap doğrulamaydı.
ALTER TABLE email_verifications
    ADD COLUMN IF NOT EXISTS purpose SMALLINT NOT NULL DEFAULT 0;

-- Sorgular her zaman "bu kullanıcının, bu amaç için, en son kodu" biçiminde.
DROP INDEX IF EXISTS ix_email_verifications_user;

CREATE INDEX IF NOT EXISTS ix_email_verifications_user_purpose
    ON email_verifications (user_id, purpose, created_at DESC);
