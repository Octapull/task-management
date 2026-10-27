/**
 * Gelen JSON'u okurken alan adının büyük/küçük harfine takılmamak için
 * küçük yardımcılar.
 *
 * Neden gerekli: REST cevapları ASP.NET Core'un varsayılanı gereği camelCase
 * geliyor (`assignedUserId`), ancak SignalR üzerinden gönderilen anonim
 * nesneler sunucu yapılandırmasına göre PascalCase (`AssignedUserId`) de
 * olabiliyor. İki ihtimali de karşılayarak, backend'de JSON ayarı değişse
 * bile arayüzün bozulmamasını garantiliyoruz.
 */

type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

/** `id` verildiğinde hem `id` hem `Id` alanına bakar. */
export function readProp(source: unknown, camelKey: string): unknown {
  if (!isRecord(source)) return undefined;

  if (camelKey in source) return source[camelKey];

  const pascalKey = camelKey.charAt(0).toUpperCase() + camelKey.slice(1);
  return pascalKey in source ? source[pascalKey] : undefined;
}

export function readNumber(source: unknown, key: string): number | null {
  const value = readProp(source, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readString(source: unknown, key: string): string | null {
  const value = readProp(source, key);
  return typeof value === 'string' ? value : null;
}
