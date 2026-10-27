import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { I18nService } from '../i18n/i18n.service';
import { AuthService } from '../services/auth.service';
import { NotifyService } from '../services/notify.service';

/**
 * Merkezi hata ele alma.
 *
 * Sadece "her yerde aynı olan" durumları burada yakalıyoruz:
 *  - 401  -> oturum gerçekten bitmiş, giriş ekranına gönder
 *  - 0    -> sunucuya ulaşılamıyor
 * Diğer hatalar (409, 400 ...) bağlama göre farklı anlatılması gerektiği için
 * çağıran bileşene aynen iletiliyor.
 *
 * Buraya ulaşan bir 401, authInterceptor'ın token'ı yenilemeyi deneyip
 * başaramadığı anlamına geliyor (bkz. app.config.ts'teki sıra) - yani
 * yenileme token'ı da ölmüş. Bu yüzden oturumu kapatmak doğru karar.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const notify = inject(NotifyService);
  const i18n = inject(I18nService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        // Giriş/kayıt ekranındaki 401 "şifre yanlış" demek; oturum düşmesi değil.
        const isAuthEndpoint = request.url.includes('/auth/');

        if (error.status === 401 && !isAuthEndpoint) {
          notify.error(i18n.t('error.sessionExpired'));
          auth.logout(location.pathname);
        }

        if (error.status === 0) {
          notify.error(i18n.t('error.offline'));
        }
      }

      return throwError(() => error);
    }),
  );
};
