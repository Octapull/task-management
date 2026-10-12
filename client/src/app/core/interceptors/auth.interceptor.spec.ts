import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { authInterceptor } from './auth.interceptor';

const SESSION_KEY = 'tms.session';
const TASKS_URL = '/api/tasks';
const REFRESH_URL = '/api/auth/refresh';

/**
 * Sessiz yenilemenin can alıcı noktaları:
 *  - süresi dolmuş token'la boşuna 401 yenmemesi,
 *  - 401 gelirse bir kez yenileyip isteği tekrarlaması,
 *  - paralel isteklerin TEK yenileme isteği atması (backend token'ı
 *    döndürdüğü için ikinci istek "iptal edilmiş token" hatası alırdı),
 *  - yenileme de tutmazsa özgün hatanın iletilmesi.
 */
describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  function storeSession(expiresAt: string, refreshToken = 'yenileme-1'): void {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        token: 'erisim-1',
        refreshToken,
        expiresAt,
        userId: 7,
        fullName: 'Demo Kullanıcı',
        role: 'Owner',
        teamId: 1,
        teamName: 'Ürün Ekibi',
        teamCode: 'KANBAN25',
      }),
    );
  }

  function authResponse(token: string, refreshToken: string) {
    return {
      token,
      refreshToken,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      userId: 7,
      fullName: 'Demo Kullanıcı',
      role: 'Owner',
      teamId: 1,
      teamName: 'Ürün Ekibi',
      teamCode: 'KANBAN25',
    };
  }

  function configure(): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  }

  const gecerli = () => new Date(Date.now() + 3_600_000).toISOString();
  const suresiDolmus = () => new Date(Date.now() - 60_000).toISOString();

  afterEach(() => {
    localStorage.clear();
    httpMock.verify();
  });

  it('geçerli token isteğe ekleniyor, yenileme yapılmıyor', () => {
    storeSession(gecerli());
    configure();

    http.get(TASKS_URL).subscribe();

    const request = httpMock.expectOne(TASKS_URL);
    expect(request.request.headers.get('Authorization')).toBe('Bearer erisim-1');
    request.flush([]);
  });

  it('süresi dolmuş token varsa istek gönderilmeden önce yenileniyor', () => {
    storeSession(suresiDolmus());
    configure();

    http.get(TASKS_URL).subscribe();

    // Önce yenileme isteği çıkmalı - boşuna 401 yenmemeli.
    const refresh = httpMock.expectOne(REFRESH_URL);
    expect(refresh.request.body).toEqual({ refreshToken: 'yenileme-1' });
    refresh.flush(authResponse('erisim-2', 'yenileme-2'));

    const request = httpMock.expectOne(TASKS_URL);
    expect(request.request.headers.get('Authorization')).toBe('Bearer erisim-2');
    request.flush([]);
  });

  it('401 alınca yenileyip isteği tekrarlıyor', () => {
    storeSession(gecerli());
    configure();

    let sonuc: unknown = null;
    http.get(TASKS_URL).subscribe((value) => (sonuc = value));

    httpMock
      .expectOne(TASKS_URL)
      .flush('gecersiz', { status: 401, statusText: 'Unauthorized' });

    httpMock.expectOne(REFRESH_URL).flush(authResponse('erisim-2', 'yenileme-2'));

    const tekrar = httpMock.expectOne(TASKS_URL);
    expect(tekrar.request.headers.get('Authorization')).toBe('Bearer erisim-2');
    tekrar.flush([{ id: 1 }]);

    expect(sonuc).toEqual([{ id: 1 }]);
  });

  it('paralel iki istek için tek yenileme isteği atılıyor', () => {
    storeSession(suresiDolmus());
    configure();

    http.get(TASKS_URL).subscribe();
    http.get('/api/labels').subscribe();

    // İkisi de aynı uçuştaki yenilemeyi bekliyor.
    const refresh = httpMock.expectOne(REFRESH_URL);
    refresh.flush(authResponse('erisim-2', 'yenileme-2'));

    httpMock.expectOne(TASKS_URL).flush([]);
    httpMock.expectOne('/api/labels').flush([]);
  });

  it('yenileme de başarısız olursa özgün 401 iletiliyor', () => {
    storeSession(gecerli());
    configure();

    let status: number | null = null;
    http.get(TASKS_URL).subscribe({
      error: (error: { status: number }) => (status = error.status),
    });

    httpMock.expectOne(TASKS_URL).flush('gecersiz', { status: 401, statusText: 'Unauthorized' });

    httpMock
      .expectOne(REFRESH_URL)
      .flush('oturum bitti', { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
  });

  it('auth uçlarına token eklenmiyor ve yenileme denenmiyor', () => {
    storeSession(gecerli());
    configure();

    http.post('/api/auth/login', {}).subscribe({ error: () => undefined });

    const request = httpMock.expectOne('/api/auth/login');
    expect(request.request.headers.has('Authorization')).toBe(false);

    // 401 = "şifre yanlış"; yenilemeye çalışmak anlamsız olurdu.
    request.flush('hatali', { status: 401, statusText: 'Unauthorized' });
  });

  it('yenileme token yoksa 401 olduğu gibi iletiliyor', () => {
    storeSession(gecerli(), '');
    configure();

    let status: number | null = null;
    http.get(TASKS_URL).subscribe({
      error: (error: { status: number }) => (status = error.status),
    });

    httpMock.expectOne(TASKS_URL).flush('gecersiz', { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
  });

  it('kendi API adresimiz dışındaki isteklere token eklenmiyor', () => {
    storeSession(gecerli());
    configure();

    http.get('https://baska-servis.example/veri').subscribe();

    const request = httpMock.expectOne('https://baska-servis.example/veri');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });
});
