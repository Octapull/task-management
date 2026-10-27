import { signal } from '@angular/core';

/**
 * Tarih biçimlendirme yardımcıları.
 *
 * Metinler çeviri sözlüğünde DEĞİL: hepsi tarayıcının `Intl` API'sinden
 * geliyor. "3 saat önce", "vor 3 Stunden", "hace 3 horas" gibi ifadeleri
 * elle çevirmek yerine `Intl.RelativeTimeFormat` üretiyor; ay adlarını
 * `Intl.DateTimeFormat`, süre birimlerini de `Intl.NumberFormat` (style:
 * 'unit') veriyor. Böylece yeni bir dil eklendiğinde buraya dokunmak
 * gerekmiyor - üstelik her dilin kendi çoğul kuralları da doğru uygulanıyor.
 *
 * Kart üzerinde yer az olduğu için tarihler mümkün olan en kısa biçimde
 * yazılıyor: "Bugün", "Yarın", "12 Ağu", farklı yıl ise "12 Ağu 2024".
 */

/**
 * Geçerli dil etiketi (ör. "tr-TR").
 *
 * Signal, çünkü bu fonksiyonlar şablonlardan çağrılıyor: dil değiştiğinde
 * tarihi gösteren bileşenlerin kendiliğinden yeniden çizilmesi gerekiyor.
 * Değeri I18nService yazıyor (bkz. `setDateLocale`); bu dosya i18n'i
 * içe aktarmıyor - aksi halde döngüsel bağımlılık oluşurdu.
 */
const locale = signal<string>('tr-TR');

export function setDateLocale(value: string): void {
  locale.set(value);
}

export function parseDate(iso: string | null): Date | null {
  if (!iso) return null;

  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : new Date(time);
}

/** Teslim tarihini kısa metne çevirir. */
export function formatDueDate(iso: string | null): string {
  const date = parseDate(iso);
  if (date === null) return '';

  const days = daysFromToday(date);

  // numeric: 'auto' sayesinde -1/0/1 için "dün/bugün/yarın" karşılığı
  // her dilde kendi doğal ifadesiyle geliyor.
  if (days >= -1 && days <= 1) {
    return capitalize(relativeFormatter().format(days, 'day'));
  }

  return formatShortDate(iso);
}

/** Tam tarih - ipucu (tooltip) metinlerinde kullanılıyor. */
export function formatFullDate(iso: string | null): string {
  const date = parseDate(iso);
  if (date === null) return '-';

  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** "3 dk önce", "2 sa önce", "5 gün önce". */
export function formatRelative(iso: string | null): string {
  const date = parseDate(iso);
  if (date === null) return '';

  const diffSeconds = Math.round((Date.now() - date.getTime()) / 1000);
  const formatter = relativeFormatter();

  // Gelecek tarihler de doğru okunsun diye işaret korunuyor: Intl "5 dakika
  // önce" ile "5 dakika sonra" arasındaki farkı kendisi kuruyor.
  if (Math.abs(diffSeconds) < 60) {
    return formatter.format(-diffSeconds, 'second');
  }

  if (Math.abs(diffSeconds) < 3600) {
    return formatter.format(-Math.trunc(diffSeconds / 60), 'minute');
  }

  if (Math.abs(diffSeconds) < 86400) {
    return formatter.format(-Math.trunc(diffSeconds / 3600), 'hour');
  }

  const days = Math.trunc(diffSeconds / 86400);
  if (Math.abs(days) < 30) return formatter.format(-days, 'day');

  return formatShortDate(iso);
}

/** Kısa tarih: "12 Ağu", farklı yıldaysa "12 Ağu 2024". Göreli sözcük yok. */
export function formatShortDate(iso: string | null): string {
  const date = parseDate(iso);
  if (date === null) return '';

  const sameYear = date.getFullYear() === new Date().getFullYear();

  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

/**
 * İki tarih arasında geçen süre: "3 gün", "5 sa", "12 dk".
 *
 * Bitiş verilmezse şu an kullanılır - devam eden işte "ne zamandır sürüyor"
 * bilgisini üretmek için.
 */
export function formatDuration(
  fromIso: string | null,
  toIso: string | null = null,
): string {
  const from = parseDate(fromIso);
  if (from === null) return '';

  const to = toIso === null ? new Date() : parseDate(toIso);
  if (to === null) return '';

  const seconds = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));

  if (seconds < 60) return formatUnit(1, 'minute');
  if (seconds < 3600) return formatUnit(Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return formatUnit(Math.floor(seconds / 3600), 'hour');

  const days = Math.floor(seconds / 86400);
  if (days < 30) return formatUnit(days, 'day');

  const months = Math.floor(days / 30);
  return months < 12
    ? formatUnit(months, 'month')
    : formatUnit(Math.floor(months / 12), 'year');
}

/** Teslim tarihi geçmiş mi? (gün bazında, saat dikkate alınmaz) */
export function isPastDue(iso: string | null): boolean {
  const date = parseDate(iso);
  return date !== null && daysFromToday(date) < 0;
}

/** Bugün mü yoksa yarın mı teslim - "yaklaşan" uyarısı için. */
export function isDueSoon(iso: string | null): boolean {
  const date = parseDate(iso);
  if (date === null) return false;

  const days = daysFromToday(date);
  return days >= 0 && days <= 1;
}

/** <input type="date"> için "yyyy-MM-dd". */
export function toDateInputValue(iso: string | null): string {
  const date = parseDate(iso);
  if (date === null) return '';

  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * <input type="date"> değerini backend'in beklediği ISO metnine çevirir.
 * Saat 00:00 yerine 12:00 seçiliyor: saat dilimi kayması yüzünden tarihin
 * bir gün geriye düşmesini önlüyor.
 */
export function fromDateInputValue(value: string): string | null {
  if (!value) return null;

  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// --- İç yardımcılar ---------------------------------------------------------

function relativeFormatter(): Intl.RelativeTimeFormat {
  return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
}

/**
 * Sayı + birim ("3 saat"). `unitDisplay: 'short'` kartlara sığan kısaltmayı
 * veriyor ve çoğul kuralını dilin kendisi uyguluyor.
 */
function formatUnit(value: number, unit: 'minute' | 'hour' | 'day' | 'month' | 'year'): string {
  return new Intl.NumberFormat(locale(), {
    style: 'unit',
    unit,
    unitDisplay: 'short',
  }).format(value);
}

/**
 * "bugün" -> "Bugün". Intl küçük harfle başlayan ifadeler döndürüyor ama bu
 * metinler kartlarda tek başına bir rozet olarak duruyor.
 */
function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase(locale()) + value.slice(1);
}

/** İki tarih arasındaki tam gün farkı (saatler sıfırlanarak). */
function daysFromToday(date: Date): number {
  const startOfDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();

  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  return Math.round((startOfDay - today) / 86_400_000);
}
