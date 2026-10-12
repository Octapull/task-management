import { Injectable, computed, signal } from '@angular/core';

import { DEFAULT_LOCALE, INTL_LOCALES, Locale, isLocale } from './locale';
import { MESSAGES, MessageKey } from './messages';
import { setDateLocale } from '../../shared/util/date';
import { setErrorTranslator } from '../util/http-error';

const LOCALE_KEY = 'tms.locale';

/**
 * Arayüz dili.
 *
 * Angular'ın yerleşik i18n'i ($localize) bilerek kullanılmadı: o her dil için
 * ayrı bir derleme üretiyor ve dil değiştirmek sayfayı başka bir adrese
 * yönlendirmeyi gerektiriyor. Burada istenen, düğmeyle anında değişen bir dil;
 * bu yüzden çeviriler çalışma zamanında bir signal üzerinden çözülüyor.
 *
 * Şablonlarda `t('anahtar')` çağrısı yapılıyor. `t` içeride `messages()`
 * signal'ini okuduğu için, dil değiştiğinde o metni gösteren bütün bileşenler
 * (hepsi OnPush) kendiliğinden yeniden çiziliyor - ekstra abonelik yok.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly locale = signal<Locale>(restore());

  private readonly messages = computed(() => MESSAGES[this.locale()]);

  /** Intl'e verilecek etiket - tarih ve sayı biçimleri bunu kullanıyor. */
  readonly intlLocale = computed(() => INTL_LOCALES[this.locale()]);

  constructor() {
    // HTTP hata metinleri saf bir modülden geliyor ve enjeksiyon bağlamına
    // erişemiyor; çeviriciyi bir kez oraya tanıtıyoruz.
    setErrorTranslator((key, params) => this.t(key, params));

    this.applySideEffects(this.locale());
  }

  /**
   * Anahtarı geçerli dildeki metne çevirir.
   *
   * @param params `{ad}` biçimindeki yer tutucular için değerler.
   * @returns Anahtar bulunamazsa anahtarın kendisi - ekranda boşluk yerine
   *          eksik çevirinin hangisi olduğu görünsün.
   */
  t(key: MessageKey, params?: Record<string, string | number>): string {
    const template = this.messages()[key] ?? key;

    if (!params) return template;

    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  }

  use(locale: Locale): void {
    this.locale.set(locale);
    this.applySideEffects(locale);

    try {
      localStorage.setItem(LOCALE_KEY, locale);
    } catch {
      // Gizli sekmede yazılamayabilir; dil yine de bu oturumda geçerli.
    }
  }

  /**
   * Signal dışına taşan iki etki:
   *  - <html lang> ekran okuyucular ve tarayıcının yazım denetimi için,
   *  - tarih yardımcıları signal'e erişemediği için ayrıca besleniyor.
   */
  private applySideEffects(locale: Locale): void {
    document.documentElement.lang = locale;
    setDateLocale(INTL_LOCALES[locale]);
  }
}

/**
 * Açılışta dil seçimi: önce kayıtlı tercih, sonra tarayıcının dili, sonra
 * varsayılan. Tarayıcı dili "en-US" gibi gelebildiği için ilk parçaya bakılıyor.
 */
function restore(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Erişilemiyorsa tarayıcı diline düşülüyor.
  }

  const browser = navigator.language?.split('-')[0];
  return isLocale(browser) ? browser : DEFAULT_LOCALE;
}
