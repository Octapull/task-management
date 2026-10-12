-- 008 - Alt görevler (kontrol listesi).
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.

-- Bir işin içindeki küçük adımlar.
--
-- Ayrı bir "iş" olarak modellemedik: alt görevlerin kendi durumu, önceliği,
-- ataması olmuyor - yalnızca yapıldı/yapılmadı. Onları tasks tablosuna
-- koymak panoyu ve bütün filtreleri gereksiz yere kalabalıklaştırırdı.
--
-- Yorumlarda olduğu gibi ON DELETE CASCADE: adımlar işin bir parçası.
CREATE TABLE IF NOT EXISTS task_checklist_items (
    id           SERIAL PRIMARY KEY,
    task_id      INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    -- Ekip filtresi tasks'a join yapmadan uygulanabilsin diye burada da var.
    team_id      INT REFERENCES teams(id),
    title        VARCHAR(300) NOT NULL,
    is_done      BOOLEAN NOT NULL DEFAULT FALSE,
    -- Sıralama kullanıcı tarafından değiştirilebiliyor; oluşturma sırası
    -- tek başına yeterli değil.
    position     INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Ekran her zaman "bu işin adımları, sıraya göre" biçiminde okuyor.
CREATE INDEX IF NOT EXISTS ix_task_checklist_task
    ON task_checklist_items (task_id, position, id);
