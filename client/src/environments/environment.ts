/**
 * Geliştirme ortamı.
 *
 * Adresler göreli (`/api`, `/hubs/tasks`) çünkü `ng serve` sırasında
 * proxy.conf.json istekleri backend'e yönlendiriyor. Böylece tarayıcı
 * her şeyi aynı origin'den görüyor ve CORS ayarına ihtiyaç kalmıyor.
 */
export const environment = {
  production: false,
  apiUrl: '/api',
  hubUrl: '/hubs/tasks',
};
