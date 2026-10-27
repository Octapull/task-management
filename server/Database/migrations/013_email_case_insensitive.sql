-- 013 - E-posta benzersizliği harf durumundan bağımsız hale geliyor.
--
-- Veritabanı zaten oluşturulmuş olanlar bu script'i bir kere çalıştırmalı.
-- Sıfırdan kuranlar için aynı yapı schema.sql içinde de tanımlı.
--
-- SORUN
-- Kayıt akışı adresi küçük harfe çeviriyor ve giriş LOWER(email) ile arıyor,
-- ama profil güncellemesi bunu yapmıyordu. Sütundaki UNIQUE kısıtı da harf
-- duyarlı olduğu için "ali@x.com" ve "ALI@X.com" aynı anda var olabiliyordu.
-- Bu durumda LOWER(email) araması iki satır döndürüyor, Dapper'ın
-- QuerySingleOrDefault'u istisna atıyor ve İKİ kullanıcı da giriş yapamıyordu.
--
-- ÇÖZÜM
-- Var olan adresler küçük harfe çekiliyor ve benzersizlik artık lower(email)
-- üzerinde bir indeksle garanti altına alınıyor - kod tarafındaki kontrol
-- atlansa bile veritabanı ikinci bir kaydı kabul etmiyor.

-- Önce çakışma var mı diye bak: varsa indeks oluşturulamaz ve hangi adreslerin
-- elle düzeltilmesi gerektiğini bilmek gerekir.
DO $$
DECLARE
    clashes text;
BEGIN
    SELECT string_agg(DISTINCT lower(email), ', ')
    INTO clashes
    FROM users
    GROUP BY lower(email)
    HAVING count(*) > 1;

    IF clashes IS NOT NULL THEN
        RAISE EXCEPTION
            'Harf durumu dışında aynı olan e-posta adresleri var: %. Bu kayıtlar birleştirilip/silinip script tekrar çalıştırılmalı.',
            clashes;
    END IF;
END $$;

-- Adresleri tek biçime indir.
UPDATE users
SET email = lower(email)
WHERE email <> lower(email);

-- Sütun üzerindeki harf duyarlı UNIQUE kısıtı yerini ifadeye dayalı indekse
-- bırakıyor. Kısıtın adı PostgreSQL'in varsayılan adlandırmasından geliyor.
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_lower
    ON users (lower(email));
