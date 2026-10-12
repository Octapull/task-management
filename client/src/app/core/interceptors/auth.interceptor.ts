import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, Observable, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

/**
 * Kendi API'mize giden isteklere JWT'yi ekler ve süresi dolan token'ı
 * sessizce yeniler.
 *
 * Token yalnızca kendi backend'imize gönderiliyor; başka bir origin'e istek
 * atıldığında (ör. harici bir servis) token sızmasın diye adres kontrolü var.
 *
 * YENİLEME İKİ YERDE DEVREYE GİRİYOR
 *  1. İstek gönderilmeden önce: elde geçerli erişim token'ı yok ama yenileme
 *     token'ı varsa, boşuna 401 yemek yerine önce yeniliyoruz.
 *  2. Yanıt 401 geldiğinde: token istemciye göre geçerliydi ama sunucu kabul
 *     etmedi (ör. sunucu yeniden başladı, saatler kaydı). Bir kez yenileyip
 *     isteği tekrarlıyoruz.
 *
 * Yenileme de başarısız olursa özgün 401 olduğu gibi iletiliyor; oturumu
 * kapatma kararını errorInterceptor veriyor (bkz. app.config.ts'teki sıra).
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);

  if (!isApiRequest(request.url)) {
    return next(request);
  }

  // Giriş, kayıt, yenileme ve çıkış uçları: bunlara token eklenmiyor ve
  // 401'leri yenilemeye çalışmak sonsuz döngü olurdu.
  if (isAuthEndpoint(request.url)) {
    return next(request);
  }

  const token = auth.token();

  // 1. Durum: token yok/ölmüş ama yenileme token'ı var.
  if (token === null && auth.hasRefreshToken()) {
    return refreshThen(auth, request, next);
  }

  const authorized = token === null ? request : withToken(request, token);

  return next(authorized).pipe(
    catchError((error: unknown) => {
      // 2. Durum: sunucu token'ı reddetti.
      if (!isUnauthorized(error) || !auth.hasRefreshToken()) {
        return throwError(() => error);
      }

      return refreshThen(auth, request, next, error);
    }),
  );
};

/**
 * Token'ı yeniler ve isteği yeni token'la (tekrar) gönderir.
 *
 * @param originalError Varsa, yenileme başarısız olduğunda bunu iletiyoruz -
 * çağıran bileşen "yenileme patladı" değil, asıl hatayı görmeli.
 */
function refreshThen(
  auth: AuthService,
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  originalError?: unknown,
): Observable<HttpEvent<unknown>> {
  return auth.refreshAccessToken().pipe(
    switchMap((fresh) => next(withToken(request, fresh))),
    catchError((refreshError: unknown) => throwError(() => originalError ?? refreshError)),
  );
}

function withToken(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}

function isApiRequest(url: string): boolean {
  // Geliştirmede apiUrl göreli ('/api'), production'da tam adres olabiliyor.
  return url.startsWith(environment.apiUrl);
}

function isAuthEndpoint(url: string): boolean {
  return url.startsWith(`${environment.apiUrl}/auth/`);
}
