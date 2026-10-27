-- 006 - İş yorumları.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.

-- Bir iş üzerinde konuşma.
--
-- activity_log'dan farklı olarak burada ON DELETE CASCADE var: yorum işin
-- kendisine ait bir içerik, iş silindiğinde konuşmanın da gitmesi doğru.
-- (activity_log'da tam tersi geçerliydi - "kim sildi" bilgisi silinmemeliydi.)
CREATE TABLE IF NOT EXISTS task_comments (
    id             SERIAL PRIMARY KEY,
    task_id        INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    -- Ekip filtresi tasks'a join yapmadan uygulanabilsin diye burada da var.
    team_id        INT REFERENCES teams(id),
    author_user_id INT REFERENCES users(id),
    body           VARCHAR(2000) NOT NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    -- Düzenlenmemiş yorumlarda NULL; arayüz "düzenlendi" etiketini buna
    -- bakarak gösteriyor.
    edited_at      TIMESTAMP
);

-- Ekran her zaman "bu işin yorumları, eskiden yeniye" biçiminde okuyor.
CREATE INDEX IF NOT EXISTS ix_task_comments_task
    ON task_comments (task_id, created_at);

CREATE INDEX IF NOT EXISTS ix_task_comments_team
    ON task_comments (team_id);
