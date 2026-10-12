-- =============================================================================
-- Demo verisi
-- -----------------------------------------------------------------------------
-- Boş bir pano tanıtım için kötü bir başlangıç: Kanban sütunları, etiketler,
-- kontrol listeleri, yorumlar ve işlem geçmişi ancak veri varken görünüyor.
-- Bu script tek bir örnek ekip kurup panoyu dolduruyor.
--
-- ÖNCE schema.sql çalıştırılmış olmalı.
--
--   psql -d taskmanagementsystem -f server/Database/seed.sql
--
-- Docker ile:
--   docker compose --profile demo up seed
--
-- Giriş bilgileri (hepsinin şifresi aynı):
--
--   demo@istakip.local    / Demo1234    <- ekip sahibi (Owner)
--   elif@istakip.local    / Demo1234
--   burak@istakip.local   / Demo1234
--   selin@istakip.local   / Demo1234
--   mert@istakip.local    / Demo1234
--
-- Ekip katılım kodu: KANBAN25
--
-- Script tekrar çalıştırılabilir: aynı ekip koduna sahip önceki demo verisi
-- silinip yeniden kuruluyor. Gerçek kullanıcı verisine dokunmuyor, yalnızca
-- KANBAN25 ekibini hedefliyor.
--
-- Tarihler NOW()'a göre göreli veriliyor; script ne zaman çalıştırılırsa
-- çalıştırılsın pano "bu hafta" gibi görünüyor (gecikmiş iş gecikmiş kalıyor).
-- =============================================================================

DO $$
DECLARE
    -- Ekip ve kullanıcılar
    v_team    INT;
    v_demo    INT;
    v_elif    INT;
    v_burak   INT;
    v_selin   INT;
    v_mert    INT;

    -- Etiketler
    v_lbl_hata     INT;
    v_lbl_ozellik  INT;
    v_lbl_tasarim  INT;
    v_lbl_acil     INT;
    v_lbl_backend  INT;
    v_lbl_frontend INT;
    v_lbl_dokuman  INT;

    -- İşler
    v_t_sifremi   INT;
    v_t_surukle   INT;
    v_t_koyutema  INT;
    v_t_signalr   INT;
    v_t_yorum     INT;
    v_t_dosya     INT;
    v_t_etiket    INT;
    v_t_hatirlat  INT;
    v_t_mobil     INT;
    v_t_rapor     INT;
    v_t_avatar    INT;
    v_t_apidok    INT;
    v_t_sablon    INT;

    -- Şifre: Demo1234  (BCrypt.Net-Next ile üretildi, work factor 11)
    c_hash TEXT := '$2a$11$PV8oxnoXRFViepLlICOX3OW.IdCi.pBWruHxza2OkPJ7sO6Ifuf5.';
BEGIN

-- --- Önceki demo verisini temizle ------------------------------------------
-- Sıra önemli: teams'e bakan yabancı anahtarların hepsi önce gitmeli.
-- tasks silinince yorum/kontrol listesi/etiket bağı/ekler ON DELETE CASCADE
-- ile kendiliğinden gidiyor.
SELECT id INTO v_team FROM teams WHERE team_code = 'KANBAN25';

IF v_team IS NOT NULL THEN
    DELETE FROM activity_log WHERE team_id = v_team;
    DELETE FROM tasks        WHERE team_id = v_team;
    DELETE FROM labels       WHERE team_id = v_team;
    DELETE FROM users        WHERE team_id = v_team;
    DELETE FROM teams        WHERE id      = v_team;

    RAISE NOTICE 'Onceki demo verisi silindi.';
END IF;

-- --- Ekip -------------------------------------------------------------------
INSERT INTO teams (name, team_code, created_at)
VALUES ('Ürün Ekibi', 'KANBAN25', NOW() - INTERVAL '38 days')
RETURNING id INTO v_team;

-- --- Kullanıcılar -----------------------------------------------------------
-- is_email_confirmed = TRUE: demo hesaplarının doğrulama kodu beklemeden
-- giriş yapabilmesi gerekiyor.
INSERT INTO users (full_name, email, password_hash, role, team_id,
                   is_email_confirmed, created_at)
VALUES ('Demo Kullanıcı', 'demo@istakip.local',  c_hash, 0, v_team, TRUE,
        NOW() - INTERVAL '38 days')
RETURNING id INTO v_demo;

INSERT INTO users (full_name, email, password_hash, role, team_id,
                   is_email_confirmed, created_at)
VALUES ('Elif Yılmaz', 'elif@istakip.local', c_hash, 1, v_team, TRUE,
        NOW() - INTERVAL '36 days')
RETURNING id INTO v_elif;

INSERT INTO users (full_name, email, password_hash, role, team_id,
                   is_email_confirmed, created_at)
VALUES ('Burak Demir', 'burak@istakip.local', c_hash, 1, v_team, TRUE,
        NOW() - INTERVAL '35 days')
RETURNING id INTO v_burak;

INSERT INTO users (full_name, email, password_hash, role, team_id,
                   is_email_confirmed, created_at)
VALUES ('Selin Arslan', 'selin@istakip.local', c_hash, 1, v_team, TRUE,
        NOW() - INTERVAL '30 days')
RETURNING id INTO v_selin;

INSERT INTO users (full_name, email, password_hash, role, team_id,
                   is_email_confirmed, created_at)
VALUES ('Mert Kaya', 'mert@istakip.local', c_hash, 1, v_team, TRUE,
        NOW() - INTERVAL '21 days')
RETURNING id INTO v_mert;

-- --- Etiketler --------------------------------------------------------------
-- Renkler LabelColors.Allowed listesinden: gray/blue/green/yellow/orange/
-- red/purple/teal. Başka bir değer arayüzde griye düşer.
INSERT INTO labels (team_id, name, color, created_at)
VALUES (v_team, 'hata', 'red', NOW() - INTERVAL '37 days')
RETURNING id INTO v_lbl_hata;

INSERT INTO labels (team_id, name, color, created_at)
VALUES (v_team, 'özellik', 'blue', NOW() - INTERVAL '37 days')
RETURNING id INTO v_lbl_ozellik;

INSERT INTO labels (team_id, name, color, created_at)
VALUES (v_team, 'tasarım', 'purple', NOW() - INTERVAL '37 days')
RETURNING id INTO v_lbl_tasarim;

INSERT INTO labels (team_id, name, color, created_at)
VALUES (v_team, 'acil', 'orange', NOW() - INTERVAL '35 days')
RETURNING id INTO v_lbl_acil;

INSERT INTO labels (team_id, name, color, created_at)
VALUES (v_team, 'backend', 'teal', NOW() - INTERVAL '35 days')
RETURNING id INTO v_lbl_backend;

INSERT INTO labels (team_id, name, color, created_at)
VALUES (v_team, 'frontend', 'green', NOW() - INTERVAL '35 days')
RETURNING id INTO v_lbl_frontend;

INSERT INTO labels (team_id, name, color, created_at)
VALUES (v_team, 'dokümantasyon', 'gray', NOW() - INTERVAL '20 days')
RETURNING id INTO v_lbl_dokuman;

-- --- İşler ------------------------------------------------------------------
-- Durum ile zaman damgaları birlikte gidiyor (ck_tasks_status_matches_stamps):
--   0 Boşta      -> started_at ve completed_at boş
--   1 Alınmış    -> started_at dolu, completed_at boş
--   2 Tamamlandı -> ikisi de dolu, completed_at >= started_at >= created_at
-- Öncelik: 0 = Düşük, 1 = Orta, 2 = Yüksek
--
-- Teslim tarihi geçmiş/yaklaşan işlerde reminder_stage bilerek "gönderilmiş"
-- olarak işaretleniyor (1 = yaklaşıyor, 2 = geçti): aksi halde arka plandaki
-- hatırlatma servisi seed'den hemen sonra demo hesaplarına e-posta göndermeye
-- çalışırdı.

-- ---- Tamamlananlar ----
INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('Şifremi unuttum akışı',
        'Kullanıcı e-posta adresini giriyor, 6 haneli kod gidiyor ve kod doğrulanınca yeni şifre belirleniyor. Kod 10 dakika geçerli.',
        2, 2, NOW() - INTERVAL '24 days',
        v_elif, v_demo, v_team,
        NOW() - INTERVAL '32 days', NOW() - INTERVAL '30 days', NOW() - INTERVAL '25 days', 0)
RETURNING id INTO v_t_sifremi;

INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('Kanban kartlarında sürükle-bırak',
        'Kartlar sütunlar arasında sürüklenebilsin. Kart bırakılır bırakılmaz yerine otursun; istek başarısız olursa eski haline dönsün (iyimser güncelleme).',
        2, 2, NOW() - INTERVAL '18 days',
        v_burak, v_demo, v_team,
        NOW() - INTERVAL '28 days', NOW() - INTERVAL '26 days', NOW() - INTERVAL '19 days', 0)
RETURNING id INTO v_t_surukle;

INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('Koyu tema',
        'Renkler CSS değişkeni üzerinden okunuyor; tema <html data-theme> ile değişiyor. Seçim tarayıcıda saklanıyor ve sayfa açılırken Angular yüklenmeden uygulanıyor.',
        2, 1, NOW() - INTERVAL '14 days',
        v_selin, v_selin, v_team,
        NOW() - INTERVAL '22 days', NOW() - INTERVAL '20 days', NOW() - INTERVAL '15 days', 0)
RETURNING id INTO v_t_koyutema;

INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('SignalR ile anlık güncelleme',
        'Bir kullanıcının yaptığı değişiklik ekipteki herkesin panosuna anında yansısın. Yayın ekip grubuna gidiyor, başka ekibin panosu etkilenmiyor.',
        2, 2, NOW() - INTERVAL '9 days',
        v_demo, v_demo, v_team,
        NOW() - INTERVAL '18 days', NOW() - INTERVAL '16 days', NOW() - INTERVAL '10 days', 0)
RETURNING id INTO v_t_signalr;

-- ---- Üstlenilmiş olanlar ----
INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('İş detayında yorum bölümü',
        'Ekip iş üzerinde konuşabilsin. Yorumu yalnızca yazarı düzenleyebilir; silmeyi yazar ya da ekip sahibi yapabilir.',
        1, 2, NOW() + INTERVAL '4 days',
        v_elif, v_demo, v_team,
        NOW() - INTERVAL '8 days', NOW() - INTERVAL '3 days', NULL, 0)
RETURNING id INTO v_t_yorum;

INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('Dosya eki yükleme',
        'İşe dosya eklenebilsin. Üst sınır 10 MB. Dosyalar wwwroot dışında tutuluyor ve indirme her zaman "attachment" olarak sunuluyor.',
        1, 1, NOW() + INTERVAL '6 days',
        v_burak, v_elif, v_team,
        NOW() - INTERVAL '11 days', NOW() - INTERVAL '5 days', NULL, 0)
RETURNING id INTO v_t_dosya;

INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('Etiket yönetimi ekranı',
        'Ekip kendi etiketlerini oluşturup düzenleyebilsin. Renk serbest metin değil, önceden belirlenmiş bir isim - koyu temada okunmayan renk seçilemesin.',
        1, 1, NOW() + INTERVAL '9 days',
        v_selin, v_demo, v_team,
        NOW() - INTERVAL '7 days', NOW() - INTERVAL '2 days', NULL, 0)
RETURNING id INTO v_t_etiket;

INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('Teslim tarihi hatırlatmaları',
        'Teslim tarihi yaklaşan ve geçen işler için e-posta gitsin. Kullanıcı bunu profil ekranından kapatabilmeli.',
        1, 0, NOW() + INTERVAL '13 days',
        v_mert, v_burak, v_team,
        NOW() - INTERVAL '5 days', NOW() - INTERVAL '1 day', NULL, 0)
RETURNING id INTO v_t_hatirlat;

-- ---- Boştakiler ----
-- Teslim tarihi geçmiş: panoda gecikmiş olarak görünüyor.
INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('Mobilde pano yatay kaydırmıyor',
        'Dar ekranda sütunlar taşıyor ama yatay kaydırma çalışmıyor; son sütuna ulaşılamıyor. Mobil Safari üzerinde de tekrarlanıyor.',
        0, 2, NOW() - INTERVAL '2 days',
        NULL, v_selin, v_team,
        NOW() - INTERVAL '6 days', NULL, NULL, 2)
RETURNING id INTO v_t_mobil;

-- Teslim tarihi yarın: yaklaşan iş.
INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('Şifre sıfırlama e-postası şablonu',
        'Şu an düz metin gidiyor. Doğrulama e-postasındaki HTML şablonun aynısı buraya da uygulanmalı.',
        0, 1, NOW() + INTERVAL '1 day',
        NULL, v_elif, v_team,
        NOW() - INTERVAL '4 days', NULL, NULL, 1)
RETURNING id INTO v_t_sablon;

INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('Raporlama: ekip performansı',
        'Kişi başına tamamlanan iş sayısı, ortalama tamamlanma süresi ve gecikme oranı. Önce hangi metriklerin gerçekten işe yaradığına karar verilmeli.',
        0, 1, NOW() + INTERVAL '7 days',
        NULL, v_demo, v_team,
        NOW() - INTERVAL '3 days', NULL, NULL, 0)
RETURNING id INTO v_t_rapor;

INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('Kullanıcı avatarları',
        'Ad soyadın baş harflerinden renkli rozet üretilsin. Kartta kimin üstlendiği bir bakışta okunsun; dosya yüklemeye gerek yok.',
        0, 0, NOW() + INTERVAL '15 days',
        NULL, v_selin, v_team,
        NOW() - INTERVAL '2 days', NULL, NULL, 0)
RETURNING id INTO v_t_avatar;

-- Teslim tarihi olmayan iş: kartta tarih satırı hiç çıkmıyor.
INSERT INTO tasks (title, description, status, priority, due_date,
                   assigned_user_id, created_by, team_id,
                   created_at, started_at, completed_at, reminder_stage)
VALUES ('API dokümantasyonunu güncelle',
        'Swagger açıklamaları eski. Yeni eklenen etiket ve ek dosya uçları hiç yazılmamış.',
        0, 0, NULL,
        NULL, v_mert, v_team,
        NOW() - INTERVAL '1 day', NULL, NULL, 0)
RETURNING id INTO v_t_apidok;

-- --- İş <-> etiket bağları --------------------------------------------------
INSERT INTO task_labels (task_id, label_id) VALUES
    (v_t_sifremi,  v_lbl_ozellik),
    (v_t_sifremi,  v_lbl_backend),
    (v_t_surukle,  v_lbl_ozellik),
    (v_t_surukle,  v_lbl_frontend),
    (v_t_koyutema, v_lbl_tasarim),
    (v_t_koyutema, v_lbl_frontend),
    (v_t_signalr,  v_lbl_ozellik),
    (v_t_signalr,  v_lbl_backend),
    (v_t_yorum,    v_lbl_ozellik),
    (v_t_dosya,    v_lbl_ozellik),
    (v_t_dosya,    v_lbl_backend),
    (v_t_etiket,   v_lbl_tasarim),
    (v_t_etiket,   v_lbl_frontend),
    (v_t_hatirlat, v_lbl_backend),
    (v_t_mobil,    v_lbl_hata),
    (v_t_mobil,    v_lbl_acil),
    (v_t_mobil,    v_lbl_frontend),
    (v_t_sablon,   v_lbl_tasarim),
    (v_t_rapor,    v_lbl_ozellik),
    (v_t_avatar,   v_lbl_tasarim),
    (v_t_apidok,   v_lbl_dokuman);

-- --- Kontrol listeleri ------------------------------------------------------
-- ck_checklist_done_has_date: is_done ile completed_at birlikte gider.
-- Bitmiş adımda tarih dolu, bitmemişte NULL olmak zorunda.
INSERT INTO task_checklist_items (task_id, team_id, title, is_done, position,
                                  created_at, completed_at)
VALUES
    (v_t_yorum, v_team, 'Yorum tablosu ve migration',        TRUE,  0,
     NOW() - INTERVAL '8 days', NOW() - INTERVAL '3 days'),
    (v_t_yorum, v_team, 'POST / PUT / DELETE uçları',        TRUE,  1,
     NOW() - INTERVAL '8 days', NOW() - INTERVAL '2 days'),
    (v_t_yorum, v_team, 'Yorum listesi bileşeni',            FALSE, 2,
     NOW() - INTERVAL '8 days', NULL),
    (v_t_yorum, v_team, 'Düzenleme ve silme yetkisi kontrolü', FALSE, 3,
     NOW() - INTERVAL '8 days', NULL),
    (v_t_yorum, v_team, 'SignalR yayını',                    FALSE, 4,
     NOW() - INTERVAL '8 days', NULL);

INSERT INTO task_checklist_items (task_id, team_id, title, is_done, position,
                                  created_at, completed_at)
VALUES
    (v_t_dosya, v_team, 'Diskte saklama servisi',            TRUE,  0,
     NOW() - INTERVAL '11 days', NOW() - INTERVAL '5 days'),
    (v_t_dosya, v_team, 'Boyut sınırı ve tip kontrolü',      TRUE,  1,
     NOW() - INTERVAL '11 days', NOW() - INTERVAL '4 days'),
    (v_t_dosya, v_team, 'İndirme ucu',                       TRUE,  2,
     NOW() - INTERVAL '11 days', NOW() - INTERVAL '2 days'),
    (v_t_dosya, v_team, 'Sürükle-bırak ile yükleme alanı',   FALSE, 3,
     NOW() - INTERVAL '11 days', NULL);

INSERT INTO task_checklist_items (task_id, team_id, title, is_done, position,
                                  created_at, completed_at)
VALUES
    (v_t_mobil, v_team, 'Hatayı gerçek cihazda tekrarla',    FALSE, 0,
     NOW() - INTERVAL '6 days', NULL),
    (v_t_mobil, v_team, 'overflow-x kuralını düzelt',        FALSE, 1,
     NOW() - INTERVAL '6 days', NULL),
    (v_t_mobil, v_team, 'Dar ekranda sütun genişliğini gözden geçir', FALSE, 2,
     NOW() - INTERVAL '6 days', NULL);

INSERT INTO task_checklist_items (task_id, team_id, title, is_done, position,
                                  created_at, completed_at)
VALUES
    (v_t_etiket, v_team, 'Etiket CRUD uçları',               TRUE,  0,
     NOW() - INTERVAL '7 days', NOW() - INTERVAL '2 days'),
    (v_t_etiket, v_team, 'Renk paleti bileşeni',             FALSE, 1,
     NOW() - INTERVAL '7 days', NULL),
    (v_t_etiket, v_team, 'İşe etiket atama arayüzü',         FALSE, 2,
     NOW() - INTERVAL '7 days', NULL);

-- --- Yorumlar ---------------------------------------------------------------
-- ck_comments_edited_after_created: edited_at ya NULL ya da created_at'ten sonra.
INSERT INTO task_comments (task_id, team_id, author_user_id, body,
                           created_at, edited_at)
VALUES
    (v_t_yorum, v_team, v_demo,
     'Yorumların da işlem geçmişine düşmesi gerekiyor mu? Bence gerekmiyor, geçmiş zaten kalabalık.',
     NOW() - INTERVAL '3 days', NULL),
    (v_t_yorum, v_team, v_elif,
     'Katılıyorum, düşmesin. Yorum zaten işin içinde duruyor, geçmişte tekrar görünmesine gerek yok.',
     NOW() - INTERVAL '3 days' + INTERVAL '2 hours', NULL),
    (v_t_yorum, v_team, v_burak,
     'Silinen yorumda ne yapacağız? Kaydı tamamen silmek yerine "bu yorum silindi" göstermek daha iyi olabilir.',
     NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '10 minutes');

INSERT INTO task_comments (task_id, team_id, author_user_id, body,
                           created_at, edited_at)
VALUES
    (v_t_dosya, v_team, v_elif,
     'Yüklenen dosyanın adını diske olduğu gibi yazmayalım; içinde yol olabilir. Sunucu kendi adını üretsin.',
     NOW() - INTERVAL '5 days', NULL),
    (v_t_dosya, v_team, v_burak,
     'Öyle yaptım, diskte GUID duruyor. Kullanıcının verdiği ad yalnızca veritabanında ve indirirken kullanılıyor.',
     NOW() - INTERVAL '4 days', NULL);

INSERT INTO task_comments (task_id, team_id, author_user_id, body,
                           created_at, edited_at)
VALUES
    (v_t_mobil, v_team, v_selin,
     'Ekran görüntüsü ekledim. 375 px genişlikte üçüncü sütun tamamen erişilemez oluyor.',
     NOW() - INTERVAL '5 days', NULL),
    (v_t_mobil, v_team, v_mert,
     'Bende de var. Sanırım pano kapsayıcısındaki overflow: hidden kuralından kaynaklanıyor.',
     NOW() - INTERVAL '4 days', NULL);

INSERT INTO task_comments (task_id, team_id, author_user_id, body,
                           created_at, edited_at)
VALUES
    (v_t_surukle, v_team, v_burak,
     'İyimser güncelleme olmadan kart bırakıldığı yerde bir an duraksıyordu. Artık istek arka planda gidiyor, hata olursa geri alınıyor.',
     NOW() - INTERVAL '20 days', NULL);

-- --- İşlem geçmişi ----------------------------------------------------------
-- task_title anlık kopyalanıyor: iş sonradan silinse bile geçmiş okunabilir
-- kalsın diye (bkz. schema.sql > activity_log).
-- action: 0 oluşturuldu, 1 güncellendi, 2 silindi, 3 üstlenildi,
--         4 bırakıldı, 5 atandı, 6 tamamlandı, 7 yeniden açıldı
INSERT INTO activity_log (task_id, task_title, action, actor_user_id,
                          target_user_id, team_id, details, created_at)
VALUES
    (v_t_sifremi,  'Şifremi unuttum akışı',            0, v_demo,  NULL,    v_team, NULL, NOW() - INTERVAL '32 days'),
    (v_t_sifremi,  'Şifremi unuttum akışı',            5, v_demo,  v_elif,  v_team, NULL, NOW() - INTERVAL '30 days'),
    (v_t_sifremi,  'Şifremi unuttum akışı',            6, v_elif,  NULL,    v_team, NULL, NOW() - INTERVAL '25 days'),

    (v_t_surukle,  'Kanban kartlarında sürükle-bırak', 0, v_demo,  NULL,    v_team, NULL, NOW() - INTERVAL '28 days'),
    (v_t_surukle,  'Kanban kartlarında sürükle-bırak', 3, v_burak, NULL,    v_team, NULL, NOW() - INTERVAL '26 days'),
    (v_t_surukle,  'Kanban kartlarında sürükle-bırak', 6, v_burak, NULL,    v_team, NULL, NOW() - INTERVAL '19 days'),

    (v_t_koyutema, 'Koyu tema',                        0, v_selin, NULL,    v_team, NULL, NOW() - INTERVAL '22 days'),
    (v_t_koyutema, 'Koyu tema',                        3, v_selin, NULL,    v_team, NULL, NOW() - INTERVAL '20 days'),
    (v_t_koyutema, 'Koyu tema',                        6, v_selin, NULL,    v_team, NULL, NOW() - INTERVAL '15 days'),

    (v_t_signalr,  'SignalR ile anlık güncelleme',     0, v_demo,  NULL,    v_team, NULL, NOW() - INTERVAL '18 days'),
    (v_t_signalr,  'SignalR ile anlık güncelleme',     3, v_demo,  NULL,    v_team, NULL, NOW() - INTERVAL '16 days'),
    (v_t_signalr,  'SignalR ile anlık güncelleme',     1, v_demo,  NULL,    v_team, 'öncelik (Orta -> Yüksek)', NOW() - INTERVAL '14 days'),
    (v_t_signalr,  'SignalR ile anlık güncelleme',     6, v_demo,  NULL,    v_team, NULL, NOW() - INTERVAL '10 days'),

    (v_t_dosya,    'Dosya eki yükleme',                0, v_elif,  NULL,    v_team, NULL, NOW() - INTERVAL '11 days'),
    (v_t_dosya,    'Dosya eki yükleme',                5, v_elif,  v_burak, v_team, NULL, NOW() - INTERVAL '5 days'),

    (v_t_yorum,    'İş detayında yorum bölümü',        0, v_demo,  NULL,    v_team, NULL, NOW() - INTERVAL '8 days'),
    (v_t_yorum,    'İş detayında yorum bölümü',        3, v_elif,  NULL,    v_team, NULL, NOW() - INTERVAL '3 days'),

    (v_t_etiket,   'Etiket yönetimi ekranı',           0, v_demo,  NULL,    v_team, NULL, NOW() - INTERVAL '7 days'),
    (v_t_etiket,   'Etiket yönetimi ekranı',           3, v_selin, NULL,    v_team, NULL, NOW() - INTERVAL '2 days'),

    (v_t_mobil,    'Mobilde pano yatay kaydırmıyor',   0, v_selin, NULL,    v_team, NULL, NOW() - INTERVAL '6 days'),
    (v_t_mobil,    'Mobilde pano yatay kaydırmıyor',   1, v_selin, NULL,    v_team, 'öncelik (Orta -> Yüksek)', NOW() - INTERVAL '5 days'),

    (v_t_sablon,   'Şifre sıfırlama e-postası şablonu', 0, v_elif, NULL,    v_team, NULL, NOW() - INTERVAL '4 days'),

    (v_t_hatirlat, 'Teslim tarihi hatırlatmaları',     0, v_burak, NULL,    v_team, NULL, NOW() - INTERVAL '5 days'),
    (v_t_hatirlat, 'Teslim tarihi hatırlatmaları',     5, v_burak, v_mert,  v_team, NULL, NOW() - INTERVAL '1 day'),

    (v_t_rapor,    'Raporlama: ekip performansı',      0, v_demo,  NULL,    v_team, NULL, NOW() - INTERVAL '3 days'),
    (v_t_avatar,   'Kullanıcı avatarları',             0, v_selin, NULL,    v_team, NULL, NOW() - INTERVAL '2 days'),
    (v_t_apidok,   'API dokümantasyonunu güncelle',    0, v_mert,  NULL,    v_team, NULL, NOW() - INTERVAL '1 day');

RAISE NOTICE 'Demo verisi hazir. Giris: demo@istakip.local / Demo1234 (ekip kodu KANBAN25)';

END $$;
