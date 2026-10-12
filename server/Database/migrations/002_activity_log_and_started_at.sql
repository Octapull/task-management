-- 002 - İşlem geçmişi tablosu ve işin başlama tarihi.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.

-- İş "Boşta"dan "Devam ediyor"a geçtiği an. Boştaki işlerde NULL.
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;

-- Mevcut kayıtlar için geriye dönük tahmin: devam eden ya da tamamlanmış
-- işlerin ne zaman başlatıldığı bilinmiyor, oluşturulma tarihini kullanıyoruz.
-- Aksi halde eski işlerin tamamı "başlangıç bilinmiyor" görünürdü.
UPDATE tasks
SET started_at = created_at
WHERE started_at IS NULL AND status <> 0;

-- İşlem geçmişi: kim, ne zaman, hangi işte ne yaptı.
--
-- task_id'de bilerek foreign key YOK: iş silindiğinde kaydın da silinmesi
-- gerekirdi, oysa "kim sildi" bilgisi tam da saklamak istediğimiz şey.
-- Aynı sebeple işin başlığı da anlık olarak kopyalanıyor (task_title).
CREATE TABLE IF NOT EXISTS activity_log (
    id             SERIAL PRIMARY KEY,
    task_id        INT,
    task_title     VARCHAR(200) NOT NULL DEFAULT '',
    action         SMALLINT NOT NULL,
    -- İşlemi yapan kişi.
    actor_user_id  INT REFERENCES users(id),
    -- Yalnızca "başkasına atadı" işleminde dolu: işin devredildiği kişi.
    target_user_id INT REFERENCES users(id),
    -- Serbest metin ayrıntı (ör. "Orta -> Yüksek"). Zorunlu değil.
    details        VARCHAR(300),
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Ekran her zaman "en yeni önce" sıralı çekiyor.
CREATE INDEX IF NOT EXISTS ix_activity_log_created_at
    ON activity_log (created_at DESC);

CREATE INDEX IF NOT EXISTS ix_activity_log_task_id
    ON activity_log (task_id);
