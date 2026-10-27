-- 014 - Zaman çizgisi tutarlılığı: biten bir şey başlamadan önce bitemez.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı kısıtlar schema.sql içinde de tanımlı.
--
-- SORUN
-- Panoda "4 Ağustos'ta başlayan iş 2 Ağustos'ta tamamlandı" görünüyordu.
-- Kaynak veriydi: geliştirme sırasında elle atılan örnek kayıtlarda
-- created_at/started_at NOW() ile, completed_at ise NOW() - 2 gün ile
-- doldurulmuştu. Uygulama bu hali üretemiyor (UpdateStatus, completed_at'i
-- her zaman started_at ile aynı ifadede dolduruyor) ama veritabanı da
-- engellemiyordu - psql'den ya da pgAdmin'den atılan tek bir satır paneli
-- imkânsız bir duruma sokabiliyordu.
--
-- ÇÖZÜM
-- Önce var olan bozuk satırlar onarılıyor, sonra aynı durumun bir daha
-- oluşamaması için CHECK kısıtları ekleniyor. Kısıtlar aynı zamanda
-- belgelendirme: sütunlar arasındaki sıra artık şemadan okunabiliyor.

-- --- 1. Onarım -------------------------------------------------------------

-- Bitiş, başlangıçtan önceyse damgaları geriye çekiyoruz. Süre UYDURMUYORUZ:
-- başlangıç bitişe eşitleniyor, oluşturma tarihi de gerekiyorsa aynı ana
-- iniyor. Elde kalan tek doğrulanabilir bilgi işin bittiği an.
UPDATE tasks
SET started_at = completed_at,
    created_at = LEAST(created_at, completed_at)
WHERE completed_at IS NOT NULL
  AND started_at IS NOT NULL
  AND completed_at < started_at;

-- Başlangıç, oluşturmadan önceyse oluşturma tarihi geriye çekiliyor: işin
-- üstlenildiği an daha güvenilir bir veri (kullanıcı eylemi), oluşturma ise
-- toplu eklemede rastgele damgalanmış olabiliyor.
UPDATE tasks
SET created_at = started_at
WHERE started_at IS NOT NULL AND started_at < created_at;

-- Tamamlanmış bir işin başlangıcı hiç yoksa bitişle aynı sayılıyor.
UPDATE tasks
SET started_at = completed_at
WHERE completed_at IS NOT NULL AND started_at IS NULL;

-- Durum ile damgaların uyumu. Durum tek gerçek kaynak sayılıyor: kullanıcının
-- panoda gördüğü ve sürüklediği şey o, damgalar ona göre düzeltiliyor.

-- Boştaki iş: iki damga da boş olmalı.
UPDATE tasks
SET started_at = NULL, completed_at = NULL
WHERE status = 0 AND (started_at IS NOT NULL OR completed_at IS NOT NULL);

-- Devam eden iş: bitiş damgası olmamalı, başlangıç olmalı.
UPDATE tasks
SET completed_at = NULL,
    started_at = COALESCE(started_at, created_at)
WHERE status = 1 AND (completed_at IS NOT NULL OR started_at IS NULL);

-- Tamamlanan iş: iki damga da dolu olmalı. Eksik bitiş için elde kalan en
-- güvenilir alt sınır başlangıç (yoksa oluşturma) anı.
UPDATE tasks
SET started_at = COALESCE(started_at, created_at),
    completed_at = COALESCE(completed_at, started_at, created_at)
WHERE status = 2 AND (started_at IS NULL OR completed_at IS NULL);

UPDATE task_checklist_items
SET created_at = completed_at
WHERE completed_at IS NOT NULL AND completed_at < created_at;

-- "Yapıldı" işaretli ama tarihi olmayan (ya da tersi) adımlar.
UPDATE task_checklist_items
SET completed_at = created_at
WHERE is_done AND completed_at IS NULL;

UPDATE task_checklist_items
SET completed_at = NULL
WHERE NOT is_done AND completed_at IS NOT NULL;

UPDATE task_comments
SET edited_at = created_at
WHERE edited_at IS NOT NULL AND edited_at < created_at;

-- --- 2. Kısıtlar -----------------------------------------------------------
-- ADD CONSTRAINT'in IF NOT EXISTS'i yok; script tekrar çalıştırılabilsin diye
-- önce düşürülüyor.

ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS ck_tasks_started_after_created,
    DROP CONSTRAINT IF EXISTS ck_tasks_completed_after_started;

-- İş oluşturulmadan üstlenilemez.
ALTER TABLE tasks
    ADD CONSTRAINT ck_tasks_started_after_created
    CHECK (started_at IS NULL OR started_at >= created_at);

-- İş başlamadan bitemez. Bitiş damgası varsa başlangıç damgası da olmalı:
-- uygulama ikisini tek UPDATE'te yazıyor, ayrı düşmeleri veri hatası demek.
ALTER TABLE tasks
    ADD CONSTRAINT ck_tasks_completed_after_started
    CHECK (
        completed_at IS NULL
        OR (started_at IS NOT NULL AND completed_at >= started_at)
    );

ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS ck_tasks_status_matches_stamps;

-- Durum ile damgalar birlikte gider. Uygulamadaki altı yazma yolunun hepsi
-- bunu zaten sağlıyor (UpdateStatus ikisini tek CASE'te yazıyor, havuza
-- döndüren yollar ikisini birden temizliyor). Kısıt olmadan elle atılan bir
-- UPDATE "tamamlandı ama bitiş tarihi yok" durumu üretebiliyordu; o işte
-- listede Bitiş sütunu "—" görünür, kartta da süre sonsuza kadar işlemeye
-- devam ederdi.
--
--   status 0 (Boşta)      -> started_at NULL,     completed_at NULL
--   status 1 (Alınmış)    -> started_at dolu,     completed_at NULL
--   status 2 (Tamamlandı) -> started_at dolu,     completed_at dolu
ALTER TABLE tasks
    ADD CONSTRAINT ck_tasks_status_matches_stamps
    CHECK (
        (status = 0 AND started_at IS NULL AND completed_at IS NULL)
     OR (status = 1 AND started_at IS NOT NULL AND completed_at IS NULL)
     OR (status = 2 AND started_at IS NOT NULL AND completed_at IS NOT NULL)
    );

ALTER TABLE task_checklist_items
    DROP CONSTRAINT IF EXISTS ck_checklist_completed_after_created,
    DROP CONSTRAINT IF EXISTS ck_checklist_done_has_date;

ALTER TABLE task_checklist_items
    ADD CONSTRAINT ck_checklist_completed_after_created
    CHECK (completed_at IS NULL OR completed_at >= created_at);

-- "Yapıldı" ile tarih birlikte gider: biri varsa diğeri de olmalı.
ALTER TABLE task_checklist_items
    ADD CONSTRAINT ck_checklist_done_has_date
    CHECK (is_done = (completed_at IS NOT NULL));

ALTER TABLE task_comments
    DROP CONSTRAINT IF EXISTS ck_comments_edited_after_created;

ALTER TABLE task_comments
    ADD CONSTRAINT ck_comments_edited_after_created
    CHECK (edited_at IS NULL OR edited_at >= created_at);

ALTER TABLE email_verifications
    DROP CONSTRAINT IF EXISTS ck_verifications_expires_after_created;

-- Eşitliğe izin var: Email:CodeLifetimeMinutes 0 yapılırsa kod anında ölür,
-- bu bir yapılandırma tercihi - kayıt akışını 500 ile kırmasın.
ALTER TABLE email_verifications
    ADD CONSTRAINT ck_verifications_expires_after_created
    CHECK (expires_at >= created_at);
