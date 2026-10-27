/**
 * Üretim ortamı (`ng build`, yani konteynerdeki derleme).
 *
 * Adresler göreli: derlenmiş dosyalar nginx'ten sunuluyor ve nginx `/api` ile
 * `/hubs` isteklerini backend'e iletiyor (bkz. `client/nginx.conf`). Böylece
 * tarayıcı her şeyi tek origin'den görüyor, CORS'a gerek kalmıyor ve adres
 * derleme anında sabitlenmediği için aynı imaj her ortamda çalışıyor.
 *
 * Angular ve API'yi ayrı origin'lerde yayınlayacaksan buraya backend'in tam
 * adresini yaz ve backend'de `Cors:AllowedOrigins` altına Angular'ın adresini
 * ekle.
 */
export const environment = {
  production: true,
  apiUrl: '/api',
  hubUrl: '/hubs/tasks',
};
