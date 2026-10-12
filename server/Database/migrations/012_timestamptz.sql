-- 012 - Zaman damgalarını TIMESTAMPTZ'ye taşır.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.
--
-- SORUN
-- Sütunlar saat dilimsiz (TIMESTAMP) olduğu için "bu değer hangi saat
-- diliminde?" sorusunun cevabı sütunda değil, kodda duruyordu - ve kodda iki
-- farklı cevap vardı:
--
--   * DateTime.UtcNow doğrudan yazıldığında Npgsql değeri timestamptz olarak
--     gönderiyor, PostgreSQL de oturumun saat dilimine (Europe/Istanbul)
--     çevirip sütuna YEREL saati yazıyordu.
--   * UtcTimestamp.ToDatabase ile yazıldığında damga Unspecified işaretlendiği
--     için sütuna GERÇEK UTC değeri düşüyordu.
--
-- Okurken ikisi de Unspecified geliyor, JSON'a "Z" eklenmiyor ve tarayıcı
-- değeri yerel saat sanıyordu. Yerel yazılan sütunlar bu sayede iki kez
-- yanılıp doğru görünüyor, UTC yazılanlar ise ekranda saat farkı kadar geride
-- kalıyordu: az önce yazılmış bir yorum "3 sa önce" görünüyordu.
--
-- ÇÖZÜM
-- Sütunlar TIMESTAMPTZ'ye geçiyor. Artık saat dilimi bilgisi verinin kendisinde:
-- Npgsql yazarken de okurken de doğru anı taşıyor, JSON "Z" ile bitiyor ve
-- istemci tarafında dönüştürme derdi kalmıyor. Kod tarafında UtcTimestamp
-- sınıfına da gerek kalmadı, kaldırıldı.
--
-- DÖNÜŞTÜRME
-- Var olan satırlar hangi yolla yazıldıysa o kabulle yorumlanıyor:
--   * yerel yazılanlar  -> AT TIME ZONE 'Europe/Istanbul'
--   * UTC yazılanlar    -> AT TIME ZONE 'UTC'
--
-- Script bir kez çalışır: sütun tipi zaten timestamptz ise hiçbir şey yapmaz.
-- (Bu koruma önemli - ikinci kez çalıştırılırsa saatler yeniden kaydırılırdı.)

DO $$
DECLARE
    -- Yerel saatle yazılmış sütunlar bu saat dilimine göre yorumlanacak.
    -- Veritabanı başka bir saat diliminde çalışıyorsa burayı değiştir.
    local_zone CONSTANT text := 'Europe/Istanbul';
BEGIN
    IF (
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'created_at'
    ) IS DISTINCT FROM 'timestamp without time zone' THEN
        RAISE NOTICE '012 atlandı: zaman damgaları zaten timestamptz.';
        RETURN;
    END IF;

    -- --- Yerel saatle yazılmış sütunlar ------------------------------------
    -- (DateTime.UtcNow doğrudan yazılıyordu ya da DEFAULT NOW() devredeydi.)

    EXECUTE format(
        'ALTER TABLE teams
            ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE %L',
        local_zone);

    EXECUTE format(
        'ALTER TABLE users
            ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE %L',
        local_zone);

    EXECUTE format(
        'ALTER TABLE tasks
            ALTER COLUMN created_at   TYPE timestamptz USING created_at   AT TIME ZONE %L,
            ALTER COLUMN due_date     TYPE timestamptz USING due_date     AT TIME ZONE %L,
            ALTER COLUMN started_at   TYPE timestamptz USING started_at   AT TIME ZONE %L,
            ALTER COLUMN completed_at TYPE timestamptz USING completed_at AT TIME ZONE %L',
        local_zone, local_zone, local_zone, local_zone);

    EXECUTE format(
        'ALTER TABLE labels
            ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE %L',
        local_zone);

    EXECUTE format(
        'ALTER TABLE activity_log
            ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE %L',
        local_zone);

    -- --- UTC yazılmış sütunlar ---------------------------------------------
    -- (UtcTimestamp.ToDatabase'den geçiyorlardı.)

    ALTER TABLE email_verifications
        ALTER COLUMN expires_at TYPE timestamptz USING expires_at AT TIME ZONE 'UTC',
        ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

    ALTER TABLE task_comments
        ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
        ALTER COLUMN edited_at  TYPE timestamptz USING edited_at  AT TIME ZONE 'UTC';

    ALTER TABLE task_checklist_items
        ALTER COLUMN created_at   TYPE timestamptz USING created_at   AT TIME ZONE 'UTC',
        ALTER COLUMN completed_at TYPE timestamptz USING completed_at AT TIME ZONE 'UTC';

    ALTER TABLE task_attachments
        ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

    RAISE NOTICE '012 tamam: zaman damgaları timestamptz.';
END $$;
