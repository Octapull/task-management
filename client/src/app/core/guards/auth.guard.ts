import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/** Korumalı sayfalar: giriş yoksa /login'e yönlendirir. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  // Doğrulaması yarıda kalmış bir kayıt varsa kullanıcıyı giriş formuna
  // değil kaldığı yere, kod ekranına gönderiyoruz.
  if (auth.pendingVerification()) return router.createUrlTree(['/verify']);

  // Giriş yaptıktan sonra kullanıcıyı gitmek istediği sayfaya döndürebilmek için
  // hedef adresi query string'de taşıyoruz.
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

/** Giriş/kayıt sayfaları: zaten giriş yapmışsa panoya gönderir. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated() ? router.createUrlTree(['/board']) : true;
};

/**
 * Doğrulama ekranı: yalnızca bekleyen bir kayıt varken açılabilir.
 *
 * Aksi halde adres çubuğuna /verify yazan biri, hangi e-postayı
 * doğrulayacağı belli olmayan boş bir ekranla karşılaşırdı.
 */
export const pendingVerificationGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return router.createUrlTree(['/board']);

  return auth.pendingVerification() ? true : router.createUrlTree(['/register']);
};
