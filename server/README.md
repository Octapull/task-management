# TaskManagementSystem

Ekip içi iş takibini kolaylaştırmak için geliştirilen, herkesin ortak iş listesini görebildiği ve anlık olarak güncel kalabildiği bir iş takip (Kanban benzeri) sistemi. Staj kapsamında geliştirilmektedir.

## Özellikler

- Kullanıcı kayıt/giriş (JWT ile) — *geliştiriliyor*
- Ortak iş listesi: her kullanıcı tüm işleri görebilir
- İş durumları: **Boşta**, **Alınmış**, **Bitmiş**
- Öncelik seviyeleri: **Düşük**, **Orta**, **Yüksek**
- İş atama: boştaki bir işi herhangi bir kullanıcı kendine alabilir
- Anlık güncelleme (SignalR) — *planlanıyor*
- Sürükle-bırak ile iş atama — *ekstra özellik, vakit kalırsa eklenecek*

## Kullanılan Teknolojiler

| Katman | Teknoloji |
|---|---|
| Backend | ASP.NET Core Web API (.NET 10) |
| Veritabanı | PostgreSQL |
| Veri erişimi | Dapper (mikro ORM) |
| Kimlik doğrulama | JWT — *geliştiriliyor* |
| Frontend | Angular — *henüz başlanmadı* |
| Gerçek zamanlı iletişim | SignalR — *planlanıyor* |

## Proje Yapısı

```
TaskManagementSystem/
├── Controllers/     # API endpointleri
├── Entities/         # Veritabanı modelleri (User, TaskItem)
├── Enums/            # UserRole, TaskItemStatus, TaskPriority
├── Data/             # IDbConnectionFactory, NpgsqlConnectionFactory
├── Extensions/        # Program.cs'i sade tutmak için DI kayıt metodları
└── Database/
    ├── schema.sql      # Tablo oluşturma script'i
    └── seed_data.sql   # Test için örnek veri
```

## Kurulum

### Gereksinimler
- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- PostgreSQL (yerel kurulum ya da Docker)

### Adımlar

1. Repoyu klonla:
   ```
   git clone <repo-url>
   cd TaskManagementSystem
   ```

2. PostgreSQL'de `taskmanagementsystem` adında bir veritabanı oluştur.

3. `Database/schema.sql` dosyasını veritabanına karşı çalıştır (tabloları oluşturur).

4. *(opsiyonel)* `Database/seed_data.sql` dosyasını çalıştırarak test verisi ekle.

5. `appsettings.json` içindeki bağlantı dizesini kendi ortamına göre düzenle:
   ```json
   "ConnectionStrings": {
     "DefaultConnection": "Host=localhost;Port=5432;Database=taskmanagementsystem;Username=postgres;Password=<kendi-sifren>"
   }
   ```

6. Paketleri yükle ve projeyi çalıştır:
   ```
   dotnet restore
   dotnet run
   ```

7. Tarayıcıda Swagger arayüzünü aç: `https://localhost:<port>/swagger`

## API Endpointleri

| Metod | Endpoint | Açıklama |
|---|---|---|
| POST | `/api/auth/register` | Kayıt ol, JWT döner |
| POST | `/api/auth/login` | Giriş yap, JWT döner |
| GET | `/api/users` | Ekip üyelerini listele (atama seçimi için) |
| GET | `/api/tasks` | Tüm işleri listele (opsiyonel `?status=` filtresi) |
| GET | `/api/tasks/{id}` | Tek iş detayı |
| POST | `/api/tasks` | Yeni iş oluştur (oluşturan, token'dan okunur) |
| PUT | `/api/tasks/{id}` | Başlık/açıklama/öncelik/teslim tarihini güncelle |
| PUT | `/api/tasks/{id}/assign?userId=` | Boştaki işi üstlen (yarış korumalı, sadece Boşta) |
| PUT | `/api/tasks/{id}/assignee?userId=` | İşi birine ata / devret (durumdan bağımsız) |
| DELETE | `/api/tasks/{id}/assignee` | Atamayı kaldır, işi havuza döndür |
| PUT | `/api/tasks/{id}/status?status=` | İş durumunu güncelle |
| DELETE | `/api/tasks/{id}` | İşi sil |

### SignalR olayları

Hub adresi: `/hubs/tasks` (token `?access_token=` ile veriliyor).

| Olay | Gövde |
|---|---|
| `TaskCreated` | İşin tamamı |
| `TaskUpdated` | İşin tamamı (içerik değişti) |
| `TaskAssigned` | İşin tamamı (atama değişti) |
| `TaskStatusChanged` | İşin tamamı (durum değişti) |
| `TaskDeleted` | Silinen işin `id`'si |

Olaylar işin tamamını taşıyor; istemci parça birleştirmek yerine kaydı
doğrudan değiştirebiliyor.

## Yol Haritası

- [x] Veritabanı tasarımı ve şeması
- [x] Dapper entegrasyonu
- [x] Task CRUD endpointleri
- [x] JWT ile kullanıcı kayıt/giriş
- [x] SignalR ile anlık bildirim
- [x] Angular frontend (`../task-management-ui`)
- [x] Sürükle-bırak ile atama

## Veritabanı güncellemeleri

Şema `Database/schema.sql` içinde. Veritabanını daha önce oluşturduysan
`Database/migrations/` altındaki script'leri sırayla çalıştır:

| Script | Ne yapar |
|---|---|
| `001_add_created_by.sql` | `tasks.created_by` sütunu + durum/atama indeksleri |

## Notlar

Bu proje aktif geliştirme aşamasındadır, yukarıdaki yol haritası ilerledikçe güncellenecektir.