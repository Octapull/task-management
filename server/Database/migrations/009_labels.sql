-- 009 - Etiketler.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.

-- Etiket tanımları. Ekibe ait ve tekrar kullanılabilir: aynı "hata" etiketi
-- onlarca işe takılabilsin diye işin içine gömülmüyor.
--
-- Renk serbest metin değil, önceden belirlenmiş bir isim (gray/blue/green/...).
-- Böylece arayüz renkleri kendi tema değişkenlerinden çözüyor ve koyu temada
-- okunmaz bir renk seçilmesi mümkün olmuyor.
CREATE TABLE IF NOT EXISTS labels (
    id         SERIAL PRIMARY KEY,
    team_id    INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name       VARCHAR(40) NOT NULL,
    color      VARCHAR(20) NOT NULL DEFAULT 'gray',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Aynı ekipte aynı isimde iki etiket olmasın; farklı ekiplerde olabilir.
CREATE UNIQUE INDEX IF NOT EXISTS ux_labels_team_name
    ON labels (team_id, lower(name));

-- İş <-> etiket bağı. Bileşik birincil anahtar aynı etiketin aynı işe iki kez
-- takılmasını veritabanı düzeyinde engelliyor.
CREATE TABLE IF NOT EXISTS task_labels (
    task_id  INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id INT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

-- "Bu etiket hangi işlerde" sorgusu için ters yön indeksi.
CREATE INDEX IF NOT EXISTS ix_task_labels_label ON task_labels (label_id);
