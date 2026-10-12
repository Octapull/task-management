-- 011 - Dosya ekleri.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.

-- Dosyanın kendisi diskte, burada yalnızca üstverisi duruyor.
--
-- İçeriği veritabanına (bytea) koymadık: yedek boyutunu şişirir, her okumada
-- veritabanı bağlantısını meşgul eder ve dosya sunmayı akış (streaming) yerine
-- belleğe yükleme haline getirirdi.
CREATE TABLE IF NOT EXISTS task_attachments (
    id               SERIAL PRIMARY KEY,
    task_id          INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    -- Ekip filtresi tasks'a join yapmadan uygulanabilsin diye burada da var.
    team_id          INT REFERENCES teams(id),
    uploaded_by      INT REFERENCES users(id),
    -- Kullanıcının gördüğü ad. Diskte BU ad kullanılmıyor: içinde ".." ya da
    -- yol ayıracı olabilir, üstelik aynı ad iki kez yüklenebilir.
    file_name        VARCHAR(255) NOT NULL,
    -- Diskteki ad - sunucunun ürettiği rastgele bir değer.
    stored_name      VARCHAR(100) NOT NULL,
    content_type     VARCHAR(150) NOT NULL DEFAULT 'application/octet-stream',
    size_bytes       BIGINT NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_task_attachments_task
    ON task_attachments (task_id, created_at);
