import { HttpErrorResponse } from '@angular/common/http';

import { MessageKey } from '../i18n/messages';

import { isRecord } from './json';

/**
 * HttpErrorResponse içinden kullanıcıya gösterilebilir bir mesaj çıkarır.
 *
 * Backend hataları üç farklı biçimde dönebiliyor:
 *  - düz metin           -> `Conflict("Bu iş zaten alınmış ya da bulunamadı.")`
 *  - ProblemDetails      -> { title, detail }
 *  - doğrulama hataları  -> { errors: { Email: ["..."] } }
 * Üçünü de tek bir yerde ele alıyoruz.
 */
type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * Çeviriciyi modül düzeyinde tutuyoruz.
 *
 * Bu dosya 39 yerden çağrılıyor ve hepsi bir hata dalında; imzaya çevirici
 * eklemek her çağrıyı değiştirmeyi gerektirirdi. Buradaki metinler şablonda
 * değil hata anında bir kez hesaplandığı için signal tepkimesi de gerekmiyor.
 * Değeri I18nService yazıyor; yazılmadıysa kaynak dil (Türkçe) kullanılıyor.
 */
let translate: Translate | null = null;

export function setErrorTranslator(value: Translate): void {
  translate = value;
}

function message(key: MessageKey, fallback: string): string {
  return translate ? translate(key) : fallback;
}

export function extractErrorMessage(
  error: unknown,
  fallback = message('error.unexpected', 'Beklenmeyen bir hata oluştu.'),
): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;

  // Sunucuya hiç ulaşılamadı: backend kapalı, sertifika reddedildi ya da CORS.
  if (error.status === 0) {
    return message('error.offline', 'Sunucuya ulaşılamıyor. Backend çalışıyor mu?');
  }

  const body: unknown = error.error;

  if (typeof body === 'string' && body.trim().length > 0) {
    return body;
  }

  if (isRecord(body)) {
    // Angular, JSON olmayan gövdeyi ayrıştıramayınca ham metni `text` alanına koyar.
    const text = body['text'];
    if (typeof text === 'string' && text.trim().length > 0) return text;

    const validationMessage = firstValidationMessage(body['errors']);
    if (validationMessage) return validationMessage;

    const detail = body['detail'];
    if (typeof detail === 'string' && detail.trim().length > 0) return detail;

    const title = body['title'];
    if (typeof title === 'string' && title.trim().length > 0) return title;
  }

  return statusMessage(error.status) ?? fallback;
}

function firstValidationMessage(errors: unknown): string | null {
  if (!isRecord(errors)) return null;

  for (const value of Object.values(errors)) {
    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }
  }

  return null;
}

function statusMessage(status: number): string | null {
  switch (status) {
    case 400:
      return message('error.badRequest', 'Gönderilen bilgiler geçersiz.');
    case 401:
      return message('error.unauthorized', 'Bu işlem için giriş yapmalısın.');
    case 403:
      return message('error.forbidden', 'Bu işlem için yetkin yok.');
    case 404:
      return message('error.notFound', 'Kayıt bulunamadı.');
    case 409:
      return message('error.conflict', 'Bu işlem şu anda yapılamıyor.');
    default:
      return status >= 500 ? message('error.server', 'Sunucuda bir hata oluştu.') : null;
  }
}
