import { HttpClient } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, map, Observable, shareReplay, tap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  LoginRequest,
  PendingVerification,
  ResetPasswordRequest,
  RegisterRequest,
  Session,
  VerifyCodeRequest,
} from '../models/auth.model';

const SESSION_KEY = 'tms.session';

/**
 * Doğrulaması bekleyen kayıt, sayfa yenilense de kaybolmasın diye
 * saklanıyor: kullanıcı kod ekranındayken F5'e basarsa baştan başlamak
 * zorunda kalmıyor.
 */
const PENDING_KEY = 'tms.pending';

/**
 * Oturum yönetimi.
 *
 * Oturum bilgisi bir signal'da tutuluyor; token'a ihtiyaç duyan yerler
 * (HTTP interceptor, SignalR bağlantısı) buradan okuyor. localStorage
 * yalnızca sayfa yenilendiğinde oturumu geri yükleyebilmek için kullanılıyor.
 *
 * Kayıt akışı iki adımlı: `register` token üretmez, yalnızca "kod gönderildi"
 * bilgisi döner. Oturum ancak `verifyCode` başarılı olduğunda başlıyor.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly session = signal<Session | null>(restoreSession());

  /** Doğrulama ekranının beslendiği kayıt; yoksa null. */
  private readonly pending = signal<PendingVerification | null>(restorePending());

  /** Giriş yapmış kullanıcı; yoksa null. */
  readonly currentUser = computed(() => this.session());

  readonly userId = computed(() => this.session()?.userId ?? null);

  readonly fullName = computed(() => this.session()?.fullName ?? '');

  readonly teamName = computed(() => this.session()?.teamName ?? '');

  readonly teamCode = computed(() => this.session()?.teamCode ?? '');

  /** Kullanıcı ekibini kuran kişi mi? */
  readonly isOwner = computed(() => this.session()?.role === 'Owner');

  /** Doğrulaması bekleyen kayıt - /verify sayfası ve guard bunu okuyor. */
  readonly pendingVerification = computed(() => this.pending());

  /**
   * Uçuştaki yenileme isteği. Paralel 401'lerin hepsi aynı isteği
   * beklesin diye tutuluyor; istek bitince null'a dönüyor.
   */
  private refreshInFlight: Observable<string> | null = null;

  /**
   * Oturum açık sayılır mı?
   *
   * Erişim token'ının süresi dolmuş olsa bile yenileme token'ı varsa "açık":
   * ilk istekte sessizce yenileniyor. Guard bu değere bakıyor - aksi halde
   * kullanıcı 60 dakika sonra sayfayı yenilediğinde, elinde geçerli bir
   * yenileme token'ı olmasına rağmen giriş ekranına düşerdi.
   */
  readonly isAuthenticated = computed(() => {
    const session = this.session();
    if (session === null) return false;

    return !isExpired(session) || session.refreshToken !== '';
  });

  /** Interceptor ve SignalR bu metodu kullanıyor. */
  token(): string | null {
    const session = this.session();
    if (session === null || isExpired(session)) return null;
    return session.token;
  }

  /**
   * Elde kullanılabilir bir yenileme token'ı var mı?
   *
   * Interceptor buna bakıp "yenilemeyi denemeye değer mi, yoksa doğrudan
   * giriş ekranına mı gönderelim" kararını veriyor.
   */
  hasRefreshToken(): boolean {
    return (this.session()?.refreshToken ?? '') !== '';
  }

  /**
   * Erişim token'ını sessizce yeniler.
   *
   * Aynı anda birden fazla istek 401 alabilir (pano açılışında paralel
   * çağrılar var). Hepsi ayrı ayrı yenileme isteği atsaydı ilki dışındakiler
   * "iptal edilmiş token" hatası alırdı - çünkü backend token'ı döndürüyor,
   * yani her yenileme öncekini geçersiz kılıyor. Bu yüzden uçuştaki istek
   * paylaşılıyor: ilk çağıran isteği başlatıyor, diğerleri aynı sonucu
   * bekliyor.
   */
  refreshAccessToken(): Observable<string> {
    if (this.refreshInFlight !== null) return this.refreshInFlight;

    const refreshToken = this.session()?.refreshToken;

    if (!refreshToken) {
      return throwError(() => new Error('Yenileme token yok.'));
    }

    this.refreshInFlight = this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/refresh`, { refreshToken })
      .pipe(
        tap((response) => this.startSession(response)),
        map((response) => response.token),
        // İstek bitince (başarılı ya da değil) paylaşım serbest bırakılıyor;
        // aksi halde bir sonraki yenileme eski sonucu okurdu.
        finalize(() => (this.refreshInFlight = null)),
        shareReplay({ bufferSize: 1, refCount: true }),
      );

    return this.refreshInFlight;
  }

  /**
   * Giriş. Hesap doğrulanmamışsa backend 403 + PendingVerification döner;
   * o gövdeyi burada yakalayıp saklıyoruz ki çağıran bileşen doğrudan
   * /verify'a yönlendirebilsin.
   */
  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, request)
      .pipe(tap((response) => this.startSession(response)));
  }

  /**
   * Kayıt. Oturum başlatmaz - kullanıcı henüz e-postasının sahibi olduğunu
   * kanıtlamadı.
   */
  register(request: RegisterRequest): Observable<PendingVerification> {
    return this.http
      .post<PendingVerification>(`${environment.apiUrl}/auth/register`, request)
      .pipe(tap((response) => this.setPending(response)));
  }

  /** Kodu doğrular ve oturumu başlatır. */
  verifyCode(request: VerifyCodeRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/verify-code`, request).pipe(
      tap((response) => {
        this.clearPending();
        this.startSession(response);
      }),
    );
  }

  /** Yeni kod ister. Çok sık istenirse backend 429 döner. */
  resendCode(email: string): Observable<PendingVerification> {
    return this.http
      .post<PendingVerification>(`${environment.apiUrl}/auth/resend-code`, { email })
      .pipe(tap((response) => this.setPending(response)));
  }

  /**
   * Şifre sıfırlama kodu ister.
   *
   * Backend, adres kayıtlı olmasa bile başarı dönüyor - kayıtlı adreslerin
   * hangileri olduğu buradan anlaşılmasın diye. Bu yüzden istemci de "adres
   * bulunamadı" gibi bir durumu ele almıyor.
   */
  forgotPassword(email: string): Observable<PendingVerification> {
    return this.http
      .post<PendingVerification>(`${environment.apiUrl}/auth/forgot-password`, {
        email,
      })
      .pipe(tap((pending) => this.setPending(pending)));
  }

  /**
   * Kodu doğrulayıp yeni şifreyi yazar ve oturumu başlatır.
   *
   * Doğru kod e-posta kutusuna erişimi kanıtlıyor; backend hesabı aynı anda
   * doğrulanmış da sayıyor, bu yüzden bekleyen doğrulama kaydı da siliniyor.
   */
  resetPassword(request: ResetPasswordRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/reset-password`, request).pipe(
      tap((response) => {
        this.clearPending();
        this.startSession(response);
      }),
    );
  }

  /**
   * Doğrulama beklemesini kaydeder.
   *
   * Login 403'ünde de çağrılıyor: hata gövdesi PendingVerification olduğu
   * için akış kayıt sonrasıyla birebir aynı ilerliyor.
   */
  setPending(pending: PendingVerification): void {
    this.pending.set(pending);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  }

  /** Kullanıcı doğrulamadan vazgeçtiğinde ya da doğrulama bittiğinde. */
  clearPending(): void {
    this.pending.set(null);
    localStorage.removeItem(PENDING_KEY);
  }

  /**
   * Profil güncellendikten sonra oturumdaki adı tazeler.
   *
   * Token'ı yeniden almıyoruz: backend yetkilendirmede yalnızca kullanıcı
   * Id'sini okuyor, ad claim'i eskimiş olsa da bir şeyi bozmuyor. Burada
   * güncellenen sadece arayüzün gösterdiği isim.
   */
  updateSessionName(fullName: string): void {
    const session = this.session();
    if (session === null) return;

    const next: Session = { ...session, fullName };

    this.session.set(next);
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  }

  /**
   * Oturumu kapatır.
   * @param returnUrl Giriş sonrası geri dönülecek adres (401 durumunda dolu gelir).
   */
  logout(returnUrl?: string): void {
    const refreshToken = this.session()?.refreshToken;

    // Yenileme token'ı sunucuda iptal ediliyor: yalnızca istemciden silmek
    // yeterli değil, kopyalanmış bir token günlerce geçerli kalırdı.
    // Yanıtı beklemiyoruz - çıkış kullanıcı açısından anında olmalı, istek
    // başarısız olsa bile oturum bu tarayıcıda kapanmış oluyor.
    if (refreshToken) {
      this.http
        .post(`${environment.apiUrl}/auth/logout`, { refreshToken })
        .subscribe({ error: () => undefined });
    }

    this.refreshInFlight = null;
    this.session.set(null);
    localStorage.removeItem(SESSION_KEY);
    this.clearPending();

    void this.router.navigate(['/login'], {
      queryParams: returnUrl ? { returnUrl } : {},
    });
  }

  private startSession(response: AuthResponse): void {
    const session: Session = {
      token: response.token,
      refreshToken: response.refreshToken,
      expiresAt: response.expiresAt,
      userId: response.userId,
      fullName: response.fullName,
      role: response.role,
      teamId: response.teamId,
      teamName: response.teamName,
      teamCode: response.teamCode,
    };

    this.session.set(session);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

function restoreSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.token !== 'string' || typeof parsed.userId !== 'number') {
      return null;
    }

    const session: Session = {
      token: parsed.token,
      // Yenileme token'ı sonradan eklendi; bu alanı içermeyen eski bir kayıt
      // geri yüklenirse boş kalıyor ve oturum eskisi gibi süreyle bitiyor.
      refreshToken: parsed.refreshToken ?? '',
      expiresAt: parsed.expiresAt ?? '',
      userId: parsed.userId,
      fullName: parsed.fullName ?? '',
      role: parsed.role ?? '',
      // Ekip alanları sonradan eklendi; eski bir kayıt geri yüklenirse
      // boş kalıyorlar. Token yine geçerli olduğu için oturumu düşürmüyoruz.
      teamId: parsed.teamId ?? 0,
      teamName: parsed.teamName ?? '',
      teamCode: parsed.teamCode ?? '',
    };

    // Erişim token'ının süresi dolmuş olabilir - yenileme token'ı varsa
    // oturum yine de geri yükleniyor: ilk istekte sessizce yenileniyor.
    // Yenileme token'ı da yoksa geri yüklemenin anlamı yok.
    if (isExpired(session) && session.refreshToken === '') return null;

    return session;
  } catch {
    // Bozuk/elle değiştirilmiş kayıt - oturumsuz başla.
    return null;
  }
}

function restorePending(): PendingVerification | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingVerification>;
    if (typeof parsed.email !== 'string') return null;

    // Kodun süresi çoktan dolmuşsa ekrana taşımanın anlamı yok; kullanıcı
    // yeniden kayıt olup taze bir kod alsın.
    const expiry = Date.parse(parsed.expiresAt ?? '');
    if (!Number.isNaN(expiry) && expiry <= Date.now()) return null;

    return {
      status: 'PendingVerification',
      email: parsed.email,
      expiresAt: parsed.expiresAt ?? '',
      resendAvailableAt: parsed.resendAvailableAt ?? '',
      teamName: parsed.teamName ?? null,
      devCode: parsed.devCode ?? null,
    };
  } catch {
    return null;
  }
}

function isExpired(session: Session): boolean {
  const expiry = Date.parse(session.expiresAt);
  if (Number.isNaN(expiry)) return false;

  // 5 saniyelik pay: tam sınırda olan token'ı "geçerli" sayıp
  // hemen 401 yemektense baştan süresi dolmuş kabul ediyoruz.
  return expiry - 5000 <= Date.now();
}
