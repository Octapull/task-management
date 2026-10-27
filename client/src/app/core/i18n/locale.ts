/**
 * Desteklenen diller.
 *
 * Kod tabanının ana dili Türkçe; diğerleri onun çevirisi. Yeni bir dil
 * eklemek için: buraya kodunu yaz, `messages/` altına dosyasını ekle ve
 * `messages/index.ts` içindeki haritaya bağla. Başka hiçbir yere dokunmak
 * gerekmiyor.
 */
export type Locale = 'tr' | 'en' | 'es' | 'de' | 'fr';

export const DEFAULT_LOCALE: Locale = 'tr';

/**
 * Dil menüsünde görünen sıra ve etiketler.
 *
 * Etiketler bilerek çevrilmiyor: dil listesinde her seçenek KENDİ dilinde
 * yazılır, çünkü menüyü açan kişi o an anlamadığı bir dilde olabilir -
 * "Almanca" yazsa Alman kullanıcı bulamaz, "Deutsch" yazınca bulur.
 */
export const LOCALES: readonly { code: Locale; label: string; flag: string }[] = [
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

/** Intl API'sine verilen tam etiketler (tarih ve sayı biçimleri için). */
export const INTL_LOCALES: Record<Locale, string> = {
  tr: 'tr-TR',
  en: 'en-GB',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.some((l) => l.code === value);
}
