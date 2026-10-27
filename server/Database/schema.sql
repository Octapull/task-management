-- Bu script'i pgAdmin, DBeaver ya da psql üzerinden veritabanına karşı
-- bir kere çalıştırman yeterli. Dapper, EF Core'un aksine migration
-- yönetmez; tablo yapısını sen (SQL ile) yönetiyorsun.
--
-- Zaman damgaları TIMESTAMPTZ (saat dilimli). Saat dilimsiz TIMESTAMP
-- kullanılmıyor: o durumda "bu değer hangi saat diliminde?" bilgisi sütunda
-- değil kodda kalıyor ve yazan/okuyan taraflar farklı varsayarsa saat kayması
-- oluyor. TIMESTAMPTZ ile Npgsql her iki yönde de doğru anı taşıyor, API
-- yanıtı "Z" ile bitiyor ve tarayıcı kullanıcının saatine kendisi çeviriyor.

-- Ekipler: sistem ekip bazlı çalışıyor, her kullanıcı bir ekibe ait ve
-- yalnızca kendi ekibinin işlerini görüyor.
CREATE TABLE teams (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    -- Ekibe katılmak isteyene paylaşılan kod. Alfabede karıştırılabilir
    -- karakterler (I/L/O/0/1) bilerek yok - kod telefonda okunurken ya da
    -- elle yazılırken yanlış anlaşılmasın.
    team_code  VARCHAR(12) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id                 SERIAL PRIMARY KEY,
    full_name          VARCHAR(150) NOT NULL,
    -- Benzersizlik sütunda değil, aşağıdaki lower(email) indeksinde: adres
    -- her yerde küçük harfe çevrilerek aranıyor, "Ali@x.com" ile "ali@x.com"
    -- iki ayrı hesap olmamalı.
    email              VARCHAR(150) NOT NULL,
    password_hash      TEXT NOT NULL,
    role               SMALLINT NOT NULL DEFAULT 1, -- 0 = Owner, 1 = Member
    team_id            INT REFERENCES teams(id),
    -- E-posta doğrulanana kadar FALSE; bu haldeki hesap giriş yapamaz,
    -- doğrudan kod ekranına yönlendirilir.
    is_email_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    -- Kendisine iş atandığında e-posta gitsin mi? Profil ekranından kapatılabilir.
    notify_on_assignment BOOLEAN NOT NULL DEFAULT TRUE,
    -- Teslim tarihi yaklaşan/geçen işler için hatırlatma gitsin mi?
    notify_on_due_date   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ux_users_email_lower ON users (lower(email));
CREATE INDEX ix_users_team_id ON users (team_id);

-- Kayıt sırasında e-postaya gönderilen 6 haneli kodlar.
CREATE TABLE email_verifications (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- E-posta ayrıca burada da tutuluyor: kullanıcı adresini sonradan
    -- değiştirse bile kodun hangi adrese gönderildiği kaydı bozulmasın.
    email      VARCHAR(150) NOT NULL,
    code       VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    -- Kaç kez yanlış girildi; sınır aşılınca kod iptal ediliyor.
    attempts   SMALLINT NOT NULL DEFAULT 0,
    -- 0 = hesap doğrulama, 1 = şifre sıfırlama. Bir akış için üretilen kod
    -- diğerinde kullanılamasın diye ayrılıyor.
    purpose    SMALLINT NOT NULL DEFAULT 0,
    -- Kullanılan kod tekrar kabul edilmez; silmek yerine işaretliyoruz ki
    -- "kaç kez kod istendi" bilgisi kaybolmasın.
    is_used    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_verifications_expires_after_created
        CHECK (expires_at >= created_at)
);

CREATE INDEX ix_email_verifications_user_purpose
    ON email_verifications (user_id, purpose, created_at DESC);

CREATE TABLE tasks (
    id                SERIAL PRIMARY KEY,
    title             VARCHAR(200) NOT NULL,
    description       TEXT,
    status            SMALLINT NOT NULL DEFAULT 0, -- 0 = Open, 1 = Taken, 2 = Completed
    priority          SMALLINT NOT NULL DEFAULT 1, -- 0 = Low, 1 = Medium, 2 = High
    due_date          TIMESTAMPTZ,
    assigned_user_id  INT REFERENCES users(id),    -- işi üstlenen kişi, boştayken NULL
    created_by        INT REFERENCES users(id),    -- işi oluşturan kişi
    -- İşin ait olduğu ekip. Filtre join yerine bu sütundan uygulanıyor:
    -- her sorguda users tablosuna gitmek gereksiz maliyet olurdu.
    team_id           INT REFERENCES teams(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at        TIMESTAMPTZ,                   -- işin üstlenildiği an, boştayken NULL
    completed_at      TIMESTAMPTZ,
    -- Hangi hatırlatmanın gönderildiği: 0 = hiç, 1 = yaklaşıyor, 2 = geçti.
    reminder_stage    SMALLINT NOT NULL DEFAULT 0,

    -- İş oluşturulmadan üstlenilemez, başlamadan bitemez. Uygulama zaten bu
    -- damgaları tek UPDATE'te tutarlı yazıyor; kısıt elle atılan SQL'e karşı.
    -- (Panoda "4 Ağustos'ta başlayan iş 2 Ağustos'ta bitti" böyle bir satırdan
    -- geliyordu - bkz. migrations/014.)
    CONSTRAINT ck_tasks_started_after_created
        CHECK (started_at IS NULL OR started_at >= created_at),
    CONSTRAINT ck_tasks_completed_after_started
        CHECK (completed_at IS NULL
               OR (started_at IS NOT NULL AND completed_at >= started_at)),

    -- Durum ile damgalar birlikte gider:
    --   0 (Boşta)      -> ikisi de boş
    --   1 (Alınmış)    -> başlangıç dolu, bitiş boş
    --   2 (Tamamlandı) -> ikisi de dolu
    -- Aksi halde "tamamlandı ama bitiş tarihi yok" gibi bir işte listede
    -- Bitiş sütunu "—" görünür, kartta süre sonsuza kadar işlemeye devam eder.
    CONSTRAINT ck_tasks_status_matches_stamps
        CHECK (
            (status = 0 AND started_at IS NULL AND completed_at IS NULL)
         OR (status = 1 AND started_at IS NOT NULL AND completed_at IS NULL)
         OR (status = 2 AND started_at IS NOT NULL AND completed_at IS NOT NULL)
        )
);

-- Panoda en sık kullanılan filtreler.
CREATE INDEX ix_tasks_status ON tasks (status);
CREATE INDEX ix_tasks_assigned_user_id ON tasks (assigned_user_id);
CREATE INDEX ix_tasks_team_id ON tasks (team_id);
CREATE INDEX ix_tasks_due_reminder ON tasks (due_date, reminder_stage)
    WHERE due_date IS NOT NULL;

-- Dosya ekleri. Dosyanın kendisi diskte, burada yalnızca üstverisi duruyor.
CREATE TABLE task_attachments (
    id           SERIAL PRIMARY KEY,
    task_id      INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    team_id      INT REFERENCES teams(id),
    uploaded_by  INT REFERENCES users(id),
    -- Kullanıcının gördüğü ad; diskte bu ad KULLANILMIYOR.
    file_name    VARCHAR(255) NOT NULL,
    -- Diskteki ad - sunucunun ürettiği rastgele değer.
    stored_name  VARCHAR(100) NOT NULL,
    content_type VARCHAR(150) NOT NULL DEFAULT 'application/octet-stream',
    size_bytes   BIGINT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_task_attachments_task ON task_attachments (task_id, created_at);

-- Etiket tanımları. Ekibe ait ve tekrar kullanılabilir.
--
-- Renk serbest metin değil, önceden belirlenmiş bir isim (gray/blue/green/...):
-- arayüz rengi kendi tema değişkenlerinden çözüyor.
CREATE TABLE labels (
    id         SERIAL PRIMARY KEY,
    team_id    INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name       VARCHAR(40) NOT NULL,
    color      VARCHAR(20) NOT NULL DEFAULT 'gray',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aynı ekipte aynı isimde iki etiket olmasın.
CREATE UNIQUE INDEX ux_labels_team_name ON labels (team_id, lower(name));

-- İş <-> etiket bağı.
CREATE TABLE task_labels (
    task_id  INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id INT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

CREATE INDEX ix_task_labels_label ON task_labels (label_id);

-- Bir işin içindeki küçük adımlar.
--
-- Ayrı bir "iş" olarak modellenmedi: alt görevlerin kendi durumu, önceliği
-- ya da ataması yok - yalnızca yapıldı/yapılmadı.
CREATE TABLE task_checklist_items (
    id           SERIAL PRIMARY KEY,
    task_id      INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    team_id      INT REFERENCES teams(id),
    title        VARCHAR(300) NOT NULL,
    is_done      BOOLEAN NOT NULL DEFAULT FALSE,
    -- Kullanıcı sırayı değiştirebiliyor.
    position     INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    CONSTRAINT ck_checklist_completed_after_created
        CHECK (completed_at IS NULL OR completed_at >= created_at),
    -- "Yapıldı" ile tarih birlikte gider: biri varsa diğeri de olmalı.
    CONSTRAINT ck_checklist_done_has_date
        CHECK (is_done = (completed_at IS NOT NULL))
);

CREATE INDEX ix_task_checklist_task
    ON task_checklist_items (task_id, position, id);

-- Bir iş üzerinde konuşma.
--
-- activity_log'dan farklı olarak burada ON DELETE CASCADE var: yorum işin
-- kendisine ait bir içerik, iş silindiğinde konuşmanın da gitmesi doğru.
CREATE TABLE task_comments (
    id             SERIAL PRIMARY KEY,
    task_id        INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    -- Ekip filtresi tasks'a join yapmadan uygulanabilsin diye burada da var.
    team_id        INT REFERENCES teams(id),
    author_user_id INT REFERENCES users(id),
    body           VARCHAR(2000) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Düzenlenmemiş yorumlarda NULL.
    edited_at      TIMESTAMPTZ,

    CONSTRAINT ck_comments_edited_after_created
        CHECK (edited_at IS NULL OR edited_at >= created_at)
);

CREATE INDEX ix_task_comments_task ON task_comments (task_id, created_at);
CREATE INDEX ix_task_comments_team ON task_comments (team_id);

-- İşlem geçmişi: kim, ne zaman, hangi işte ne yaptı.
--
-- task_id'de bilerek foreign key YOK: iş silindiğinde kaydın da silinmesi
-- gerekirdi, oysa "kim sildi" bilgisi tam da saklamak istediğimiz şey.
-- Aynı sebeple işin başlığı da anlık olarak kopyalanıyor (task_title).
CREATE TABLE activity_log (
    id             SERIAL PRIMARY KEY,
    task_id        INT,
    task_title     VARCHAR(200) NOT NULL DEFAULT '',
    action         SMALLINT NOT NULL,
    actor_user_id  INT REFERENCES users(id),       -- işlemi yapan kişi
    target_user_id INT REFERENCES users(id),       -- yalnızca devir işleminde dolu
    team_id        INT REFERENCES teams(id),       -- kaydın ait olduğu ekip
    details        VARCHAR(300),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_activity_log_created_at ON activity_log (created_at DESC);
CREATE INDEX ix_activity_log_task_id ON activity_log (task_id);
CREATE INDEX ix_activity_log_team_id ON activity_log (team_id);

-- Yenileme (refresh) token'ları.
--
-- Erişim token'ı (JWT) kısa ömürlü ve sunucuda saklanmıyor, bu yüzden iptal
-- edilemiyor. Yenileme token'ı ise burada duruyor: uzun ömürlü olabiliyor
-- çünkü gerektiğinde iptal edilebiliyor.
--
-- Token'ın kendisi değil SHA-256 özeti saklanıyor - veritabanı sızarsa
-- eldeki özetlerle oturum açılamasın diye. Şifrelerdeki BCrypt burada
-- gereksiz: değer kullanıcının seçtiği bir parola değil, 32 baytlık
-- rastgele veri.
CREATE TABLE refresh_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- SHA-256'nın onaltılık gösterimi: her zaman 64 karakter.
    token_hash  CHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Kullanılmış/iptal edilmiş token'lar silinmiyor: yeniden kullanılmaya
    -- çalışıldığında fark edilebilsin diye kayıt kalıyor.
    revoked_at  TIMESTAMPTZ,
    -- Döndürme zinciri: bu token'ın yerine geçen token'ın özeti.
    replaced_by CHAR(64),

    CONSTRAINT ck_refresh_expires_after_created
        CHECK (expires_at >= created_at)
);

CREATE INDEX ix_refresh_tokens_user ON refresh_tokens (user_id, expires_at DESC);
