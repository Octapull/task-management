-- 015 - Yenileme (refresh) token'ları.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.
--
-- SORUN
-- Erişim token'ı (JWT) 60 dakika yaşıyordu ve süresi dolduğunda kullanıcı
-- çalışmasının ortasında giriş ekranına düşüyordu. Süreyi uzatmak çözüm
-- değil: JWT sunucuda saklanmadığı için iptal edilemiyor, uzun ömürlü bir
-- token çalınırsa süresi dolana kadar geçerli kalıyor.
--
-- ÇÖZÜM
-- Erişim token'ı kısa ömürlü kalıyor; yanında uzun ömürlü bir yenileme
-- token'ı veriliyor. Erişim token'ı ölünce istemci sessizce yenisini alıyor.
-- Yenileme token'ı JWT değil, veritabanında duran rastgele bir değer - bu
-- yüzden iptal EDİLEBİLİYOR.
--
-- NEDEN HASH SAKLANIYOR
-- Token'ın kendisi değil SHA-256 özeti yazılıyor. Veritabanı sızarsa eldeki
-- özetlerle oturum açılamıyor. Şifrelerdeki BCrypt yerine düz SHA-256
-- yetiyor: bu değer kullanıcının seçtiği bir parola değil, 32 baytlık
-- rastgele veri - sözlük saldırısına konu olmuyor.

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- SHA-256'nın onaltılık gösterimi: her zaman 64 karakter.
    token_hash  CHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Kullanılmış ya da iptal edilmiş token'lar silinmiyor: yeniden
    -- kullanılmaya çalışıldığında bunu fark edebilmek için kayıt duruyor
    -- (bkz. RefreshTokenService > yeniden kullanım tespiti).
    revoked_at  TIMESTAMPTZ,
    -- Döndürme zinciri: bu token'ın yerine geçen token'ın özeti.
    replaced_by CHAR(64),

    CONSTRAINT ck_refresh_expires_after_created
        CHECK (expires_at >= created_at)
);

-- "Bu kullanıcının geçerli token'ları" sorgusu için.
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user
    ON refresh_tokens (user_id, expires_at DESC);
