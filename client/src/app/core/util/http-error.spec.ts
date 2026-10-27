import { HttpErrorResponse } from '@angular/common/http';

import { extractErrorMessage } from './http-error';

function httpError(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body });
}

describe('extractErrorMessage', () => {
  it('HttpErrorResponse olmayan girdide yedek metni döner', () => {
    expect(extractErrorMessage(new Error('bir şey'), 'yedek')).toBe('yedek');
  });

  it('sunucuya ulaşılamadığında bunu açıkça söyler', () => {
    // status 0: backend kapalı, sertifika reddedildi ya da CORS.
    expect(extractErrorMessage(httpError(0, null))).toContain('Sunucuya ulaşılamıyor');
  });

  it('düz metin gövdeyi olduğu gibi kullanır', () => {
    const message = 'Bu iş zaten alınmış ya da bulunamadı.';

    expect(extractErrorMessage(httpError(409, message))).toBe(message);
  });

  it('doğrulama hatalarından ilk mesajı seçer', () => {
    const body = { errors: { Email: ['Geçerli bir e-posta adresi gir.'] } };

    expect(extractErrorMessage(httpError(400, body))).toBe('Geçerli bir e-posta adresi gir.');
  });

  it('ProblemDetails içinden detail alanını okur', () => {
    const body = {
      title: 'Sunucu hatası',
      detail: 'Veritabanına ulaşılamıyor.',
    };

    expect(extractErrorMessage(httpError(503, body))).toBe('Veritabanına ulaşılamıyor.');
  });

  it('detail yoksa title alanına düşer', () => {
    const body = { title: 'Sunucuda beklenmeyen bir hata oluştu.' };

    expect(extractErrorMessage(httpError(500, body))).toBe('Sunucuda beklenmeyen bir hata oluştu.');
  });

  it('JSON olarak ayrıştırılamayan gövdenin ham metnini kullanır', () => {
    // Angular, ayrıştıramadığı gövdeyi `text` alanına koyuyor.
    const body = { text: 'Cok fazla deneme yaptin.' };

    expect(extractErrorMessage(httpError(429, body))).toBe('Cok fazla deneme yaptin.');
  });

  it('gövde boşsa duruma göre anlamlı bir metin üretir', () => {
    expect(extractErrorMessage(httpError(403, null))).toBe('Bu işlem için yetkin yok.');
    expect(extractErrorMessage(httpError(404, null))).toBe('Kayıt bulunamadı.');
    expect(extractErrorMessage(httpError(500, null))).toBe('Sunucuda bir hata oluştu.');
  });

  it('tanımadığı durum kodunda yedek metne düşer', () => {
    expect(extractErrorMessage(httpError(418, null), 'yedek')).toBe('yedek');
  });
});
