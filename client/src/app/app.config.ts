import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    // Sıra önemli. Listede önce yazılan DIŞTA kalıyor: istek onun içinden
    // geçip auth'a iniyor, yanıt ise auth'tan çıkıp ona ulaşıyor.
    //
    // error dışta olmalı, çünkü 401'i önce auth görmeli: token'ı sessizce
    // yenileyip isteği tekrarlıyor. Yenileme de tutmazsa hata error'a
    // ulaşıyor ve oturum orada kapatılıyor. Sıra ters olsaydı error, auth
    // daha yenilemeye fırsat bulamadan kullanıcıyı giriş ekranına atardı.
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
    // Not: @angular/animations'a ihtiyaç yok - kullandığımız Material
    // bileşenleri (dialog, snackbar, menu, tooltip) CSS animasyonlarıyla
    // çalışıyor. Paket eklemeyip paket boyutunu küçük tutuyoruz.
  ],
};
