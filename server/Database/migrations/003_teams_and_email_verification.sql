-- 003 - Ekip (takım) yapısı ve e-posta ile hesap doğrulama.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.

-- --- Ekipler ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS teams (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    -- Ekibe katılmak isteyene paylaşılan kod. Alfabede karıştırılabilir
    -- karakterler (I/L/O/0/1) bilerek yok - kod telefonda okunurken ya da
    -- elle yazılırken yanlış anlaşılmasın.
    team_code  VARCHAR(12) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- --- Kullanıcı: ekip bağı ve doğrulama durumu ------------------------------

-- team_id NULL kabul ediyor çünkü kolon sonradan ekleniyor; aşağıdaki
-- backfill mevcut kayıtların hepsini dolduruyor, sonrasında uygulama
-- her yeni kullanıcıya mutlaka bir ekip atıyor.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS team_id INT REFERENCES teams(id);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_email_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_users_team_id ON users (team_id);

-- --- İşler ve geçmiş kayıtları de ekibe ait --------------------------------
--
-- Ekip filtresi sorgularda bu sütunlar üzerinden uygulanıyor; join ile
-- users tablosuna gitmek her sorguya gereksiz maliyet bindirirdi.

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS team_id INT REFERENCES teams(id);

ALTER TABLE activity_log
    ADD COLUMN IF NOT EXISTS team_id INT REFERENCES teams(id);

CREATE INDEX IF NOT EXISTS ix_tasks_team_id ON tasks (team_id);
CREATE INDEX IF NOT EXISTS ix_activity_log_team_id ON activity_log (team_id);

-- --- E-posta doğrulama kodları ---------------------------------------------

CREATE TABLE IF NOT EXISTS email_verifications (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- E-posta ayrıca burada da tutuluyor: kullanıcı adresini sonradan
    -- değiştirse bile kodun hangi adrese gönderildiği kaydı bozulmasın.
    email      VARCHAR(150) NOT NULL,
    code       VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    -- Kullanılan kod tekrar kabul edilmez; silmek yerine işaretliyoruz ki
    -- "kaç kez kod istendi" bilgisi kaybolmasın.
    is_used    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Doğrulama her zaman "bu kullanıcının en son üretilmiş kodu" üzerinden
-- ilerliyor, sorgu da bu sıraya göre okuyor.
CREATE INDEX IF NOT EXISTS ix_email_verifications_user
    ON email_verifications (user_id, created_at DESC);

-- --- Mevcut veriyi tek bir ekibe taşı --------------------------------------
--
-- Sistem şimdiye kadar ekipsiz kullanıldı: bütün kayıtlar tek bir ekibe ait
-- sayılıyor, aksi halde ekip filtresi devreye girdiği an eski işlerin hepsi
-- ekrandan kaybolurdu.
--
-- Eskiden kayıt olanlar doğrulanmış kabul ediliyor - kayıt oldukları sırada
-- böyle bir adım yoktu, kimseyi kendi hesabından kilitlemiyoruz.

DO $$
DECLARE
    legacy_team_id INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE team_id IS NULL) THEN
        RETURN;
    END IF;

    SELECT id INTO legacy_team_id FROM teams WHERE team_code = 'TAKIM001';

    IF legacy_team_id IS NULL THEN
        INSERT INTO teams (name, team_code)
        VALUES ('Varsayılan Ekip', 'TAKIM001')
        RETURNING id INTO legacy_team_id;
    END IF;

    UPDATE users        SET team_id = legacy_team_id WHERE team_id IS NULL;
    UPDATE tasks        SET team_id = legacy_team_id WHERE team_id IS NULL;
    UPDATE activity_log SET team_id = legacy_team_id WHERE team_id IS NULL;

    UPDATE users SET is_email_confirmed = TRUE WHERE is_email_confirmed = FALSE;
END $$;

-- Rol sayıları değişmedi (0 ve 1), yalnızca anlamları güncellendi:
-- eski Admin -> Owner, eski Employee -> Member. Bu yüzden veri taşımaya
-- gerek yok; tek eksik, hiç 0'ı olmayan bir ekibin sahipsiz kalması.
-- Böyle bir durumda ekibin en eski üyesi sahip sayılıyor.
UPDATE users u
SET role = 0
WHERE u.role <> 0
  AND u.team_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM users owner
      WHERE owner.team_id = u.team_id AND owner.role = 0
  )
  AND u.id = (
      SELECT candidate.id FROM users candidate
      WHERE candidate.team_id = u.team_id
      ORDER BY candidate.created_at, candidate.id
      LIMIT 1
  );
