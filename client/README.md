# İş Takip Sistemi — Angular Arayüz

`TaskManagementSystem` .NET Core API'si için Angular 21 arayüzü: JWT kimlik
doğrulama, sürükle-bırak destekli Kanban panosu, liste görünümü ve SignalR ile
anlık güncelleme.

## Çalıştırma

Backend'in ayakta olması gerekiyor (`https://localhost:7206`):

```bash
cd task-management-ui
npm install
npm start          # http://localhost:4200
```

`ng serve`, `proxy.conf.json` üzerinden `/api` ve `/hubs` isteklerini backend'e
yönlendiriyor. Bu sayede tarayıcı her şeyi aynı origin'de gördüğü için
**geliştirmede CORS ayarına gerek yok** ve backend'in kendi imzaladığı HTTPS
sertifikası sorun çıkarmıyor (`"secure": false`).

Backend farklı bir portta çalışıyorsa `proxy.conf.json` içindeki `target`
değerini güncelle.

### Diğer komutlar

```bash
npm run build      # production derlemesi (dist/)
npm test           # birim testleri
```

## Mimari

```
src/
├── environments/            # API ve hub adresleri (dev / production)
├── styles/                  # global stil katmanı
│   ├── _tokens.scss         #   renk, tipografi, boşluk değişkenleri (açık/koyu)
│   ├── _base.scss           #   reset, tipografi, odak halkası, scrollbar
│   ├── _primitives.scss     #   .btn .input .badge .avatar .segmented ...
│   └── _material.scss       #   Material token eşlemesi + CDK drag-drop stilleri
└── app/
    ├── core/                # durum ve iletişim katmanı (UI içermez)
    │   ├── models/          #   TaskItem, enum'lar, auth sözleşmeleri
    │   ├── services/
    │   │   ├── auth.service.ts        # oturum + token (signal)
    │   │   ├── task-api.service.ts    # /api/tasks HTTP çağrıları
    │   │   ├── task.store.ts          # tek iş listesi + filtreler + iyimser güncelleme
    │   │   ├── realtime.service.ts    # SignalR bağlantısı ve olayları
    │   │   ├── user-directory.service.ts
    │   │   ├── notify.service.ts      # toast
    │   │   └── theme.service.ts
    │   ├── interceptors/    #   JWT ekleme, 401 yakalama
    │   ├── guards/          #   authGuard / guestGuard
    │   └── util/            #   JSON okuma, hata mesajı, TaskItem dönüşümü
    ├── shared/ui/           # icon, logo, confirm-dialog
    └── features/
        ├── auth/            # auth-shell, login, register
        └── dashboard/       # shell, board, task-list, task-card, task-menu, task-dialog
```

### Veri akışı

Sunucudan gelen liste, SignalR bildirimleri ve kullanıcının kendi değişiklikleri
tek bir yerde — `TaskStore` — birleşiyor. Bileşenler listeyi doğrudan
değiştirmiyor, store'un metotlarını çağırıyor.

Yazma işlemleri **iyimser (optimistic)**: kart bırakıldığı anda yeni kolonuna
yerleşiyor, istek başarısız olursa liste eski haline dönüyor ve hata toast'ı
çıkıyor. Aynı işi iki kişi aynı anda almaya çalışırsa backend 409 döndüğü için
geç kalan tarafın ekranı kendiliğinden düzeliyor.

SignalR bağlantısı koptuktan sonra geri geldiğinde (`resync`) liste baştan
çekiliyor — bağlantı yokken kaçırılan değişiklikler böyle telafi ediliyor.

### Sürükle-bırak

- Kolonlar arası taşıma → durum değişikliği.
- **Boşta → Devam ediyor** geçişi `PUT /tasks/{id}/assign` ile yapılıyor (durum
  ve atama tek istekte, yarış durumu backend'de engelleniyor). Diğer geçişler
  `PUT /tasks/{id}/status` kullanıyor.
- Kolon **içi** sıralama kapalı: backend'de sıra bilgisi tutulmuyor, sayfa
  yenilenince eski sıraya dönmesi kafa karıştırıcı olurdu. Kartlar otomatik
  olarak önce önceliğe, sonra teslim tarihine göre sıralanıyor.

### Tasarım sistemi

Renk, ölçü ve tipografi değerleri yalnızca `styles/_tokens.scss` içinde; hiçbir
bileşen ham hex ya da px yazmıyor. Açık/koyu tema aynı değişkenlerin farklı
değerleri, `<html data-theme="...">` ile değişiyor.

Angular Material sadece overlay bileşenleri için kullanılıyor (dialog, snackbar,
menu, tooltip); buton/input/kart gibi görsel omurga kendi primitiflerimiz.
Material'ın sistem token'ları (`--mat-sys-*`) kendi değişkenlerimize bağlandığı
için tema geçişi Material bileşenlerinde de çalışıyor.

Yazı tipi Inter, `@fontsource` üzerinden yerel olarak sunuluyor — dış CDN yok.
İkonlar Lucide path'lerinden inline SVG (`shared/ui/icon`), ikon fontu indirilmiyor.

## Backend ile ilişki

Arayüzün ihtiyaç duyduğu uç noktalar backend'de mevcut:

| Arayüzdeki işlem | Uç nokta |
|---|---|
| Kullanıcı listesi (isimler, atama menüsü) | `GET /api/users` |
| Yeni iş | `POST /api/tasks` (oluşturan token'dan) |
| Kartı düzenle | `PUT /api/tasks/{id}` |
| "Üstlen" / Boşta → Devam ediyor sürüklemesi | `PUT /api/tasks/{id}/assign?userId=` |
| "Başkasına ata" | `PUT /api/tasks/{id}/assignee?userId=` |
| "Atamayı kaldır" / havuza geri gönder | `DELETE /api/tasks/{id}/assignee` |
| Diğer kolon geçişleri | `PUT /api/tasks/{id}/status?status=` |

**Veritabanı:** `created_by` sütunu sonradan eklendi. Veritabanını daha önce
oluşturduysan `../TaskManagementSystem/Database/migrations/001_add_created_by.sql`
script'ini bir kere çalıştır. Eski kayıtlarda oluşturan bilgisi olmadığı için
arayüz "Bilinmiyor" gösterir.

**CORS:** Geliştirmede proxy sayesinde devrede değil. Angular'ı ayrı bir adresten
yayınlarken backend'deki `appsettings.json > Cors:AllowedOrigins` listesine o
adresi ekle.

### Bilinen sınırlar

- **Kolon içi sıralama kalıcı değil** — `tasks` tablosunda sıra sütunu yok.
- **Tarihler saat dilimsiz saklanıyor** (`TIMESTAMP`). Sunucu ve veritabanı aynı
  saat diliminde olduğu sürece gidiş-dönüş tutarlı; farklı bölgelerde çalışan
  ekipler için sütunların `TIMESTAMPTZ`'ye çevrilmesi gerekir.
- **Yetkilendirme rol bazlı değil** — giriş yapan herkes her işi düzenleyebilir
  ve silebilir. Ekip içi ortak havuz mantığı bunu gerektiriyordu; kısıtlama
  istenirse `UserRole.Admin` üzerinden kural eklenebilir.
