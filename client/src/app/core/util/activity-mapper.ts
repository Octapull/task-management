import { ActivityAction, ActivityEntry, ActivityPage } from '../models/activity.model';
import { readNumber, readProp, readString } from './json';

/**
 * Ham JSON'u ActivityEntry'ye çevirir.
 *
 * Hem REST cevabı hem SignalR mesajı buradan geçiyor - task-mapper ile aynı
 * gerekçe: alan adı büyük/küçük harf farkı tek yerde ele alınsın.
 *
 * @returns Geçerli bir id yoksa null.
 */
export function parseActivity(raw: unknown): ActivityEntry | null {
  const id = readNumber(raw, 'id');
  if (id === null) return null;

  const action = toAction(readProp(raw, 'action'));
  if (action === null) return null;

  return {
    id,
    taskId: readNumber(raw, 'taskId'),
    taskTitle: readString(raw, 'taskTitle') ?? '',
    action,
    actorUserId: readNumber(raw, 'actorUserId'),
    actorName: readString(raw, 'actorName'),
    targetUserId: readNumber(raw, 'targetUserId'),
    targetName: readString(raw, 'targetName'),
    details: readString(raw, 'details'),
    createdAt: readString(raw, 'createdAt') ?? new Date().toISOString(),
  };
}

export function parseActivityList(raw: unknown): ActivityEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw.map(parseActivity).filter((entry): entry is ActivityEntry => entry !== null);
}

/** Sayı (0-7) ya da metin ("TaskCreated") gelebilir. */
export function toAction(value: unknown): ActivityAction | null {
  if (typeof value === 'number' && value in ActivityAction) {
    return value as ActivityAction;
  }

  if (typeof value === 'string' && value in ActivityAction) {
    return ActivityAction[value as keyof typeof ActivityAction];
  }

  return null;
}

/**
 * Sayfalanmış yanıtı çözer.
 *
 * Beklenen gövde bulunamazsa boş bir sayfa dönüyor: geçmiş ekranı ikincil
 * bir görünüm, biçim değişikliğinde uygulamayı düşürmesin.
 */
export function parseActivityPage(raw: unknown): ActivityPage {
  const entries = parseActivityList(readProp(raw, 'items'));
  const total = readNumber(raw, 'total');

  return {
    entries,
    total: total ?? entries.length,
    hasMore: readProp(raw, 'hasMore') === true,
  };
}
