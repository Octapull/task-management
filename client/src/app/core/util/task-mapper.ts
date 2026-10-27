import {
  ChecklistItem,
  TaskAttachment,
  TaskComment,
  TaskItem,
  TaskItemStatus,
  TaskPriority,
} from '../models/task.model';
import { readNumber, readProp, readString } from './json';

/** Dizi değilse boş dizi; sayı olmayan öğeler atılıyor. */
function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is number => typeof item === 'number');
}

/**
 * Ham JSON'u TaskItem'a çevirir.
 *
 * Hem REST cevapları hem SignalR mesajları buradan geçiyor; böylece alan adı
 * büyük/küçük harf farkı ya da enum'ın sayı yerine metin gelmesi gibi
 * durumlar tek bir yerde ele alınıyor.
 *
 * @returns Geçerli bir id yoksa null.
 */
export function parseTask(raw: unknown): TaskItem | null {
  const id = readNumber(raw, 'id');
  if (id === null) return null;

  return {
    id,
    title: readString(raw, 'title') ?? '',
    description: readString(raw, 'description') ?? '',
    status: toStatus(readProp(raw, 'status')) ?? TaskItemStatus.Open,
    priority: toPriority(readProp(raw, 'priority')) ?? TaskPriority.Medium,
    dueDate: readString(raw, 'dueDate'),
    assignedUserId: readNumber(raw, 'assignedUserId'),
    createdByUserId: readNumber(raw, 'createdByUserId'),
    createdAt: readString(raw, 'createdAt') ?? new Date().toISOString(),
    startedAt: readString(raw, 'startedAt'),
    completedAt: readString(raw, 'completedAt'),
    checklistTotal: readNumber(raw, 'checklistTotal') ?? 0,
    checklistDone: readNumber(raw, 'checklistDone') ?? 0,
    labelIds: toNumberArray(readProp(raw, 'labelIds')),
  };
}

/**
 * Gelen mesaj işin tamamını mı yoksa sadece değişen alanları mı taşıyor?
 *
 * Backend artık her SignalR olayında işin tamamını gönderiyor; bu kontrol,
 * eski kısmi biçimi ({ Id, Status, AssignedUserId }) gönderen bir sürümle de
 * çalışabilmek için var. Kısmi mesajı "tam" sanıp uygularsak başlık gibi
 * alanları boşaltmış oluruz.
 */
export function isFullTaskPayload(raw: unknown): boolean {
  return typeof readProp(raw, 'title') === 'string';
}

export function parseTaskList(raw: unknown): TaskItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.map(parseTask).filter((task): task is TaskItem => task !== null);
}

/** Sayı (0/1/2) ya da metin ("Open") gelebilir. */
export function toStatus(value: unknown): TaskItemStatus | null {
  if (typeof value === 'number' && value in TaskItemStatus) {
    return value as TaskItemStatus;
  }

  switch (String(value)) {
    case 'Open':
      return TaskItemStatus.Open;
    case 'Taken':
      return TaskItemStatus.Taken;
    case 'Completed':
      return TaskItemStatus.Completed;
    default:
      return null;
  }
}

export function toPriority(value: unknown): TaskPriority | null {
  if (typeof value === 'number' && value in TaskPriority) {
    return value as TaskPriority;
  }

  switch (String(value)) {
    case 'Low':
      return TaskPriority.Low;
    case 'Medium':
      return TaskPriority.Medium;
    case 'High':
      return TaskPriority.High;
    default:
      return null;
  }
}

/**
 * Ham JSON'u TaskComment'e çevirir.
 *
 * Hem REST cevabı hem SignalR mesajı buradan geçiyor - iş ve geçmiş
 * dönüştürücüleriyle aynı gerekçe.
 *
 * @returns Geçerli bir id yoksa null.
 */
export function parseComment(raw: unknown): TaskComment | null {
  const id = readNumber(raw, 'id');
  const taskId = readNumber(raw, 'taskId');

  if (id === null || taskId === null) return null;

  return {
    id,
    taskId,
    authorUserId: readNumber(raw, 'authorUserId'),
    authorName: readString(raw, 'authorName'),
    body: readString(raw, 'body') ?? '',
    createdAt: readString(raw, 'createdAt') ?? new Date().toISOString(),
    editedAt: readString(raw, 'editedAt'),
  };
}

export function parseCommentList(raw: unknown): TaskComment[] {
  if (!Array.isArray(raw)) return [];

  return raw.map(parseComment).filter((comment): comment is TaskComment => comment !== null);
}

/** Ham JSON'u kontrol listesi adımına çevirir. */
export function parseChecklistItem(raw: unknown): ChecklistItem | null {
  const id = readNumber(raw, 'id');
  const taskId = readNumber(raw, 'taskId');

  if (id === null || taskId === null) return null;

  return {
    id,
    taskId,
    title: readString(raw, 'title') ?? '',
    isDone: readProp(raw, 'isDone') === true,
    position: readNumber(raw, 'position') ?? 0,
    createdAt: readString(raw, 'createdAt') ?? new Date().toISOString(),
    completedAt: readString(raw, 'completedAt'),
  };
}

export function parseChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.map(parseChecklistItem).filter((item): item is ChecklistItem => item !== null);
}

/** Ham JSON'u dosya ekine çevirir. */
export function parseAttachment(raw: unknown): TaskAttachment | null {
  const id = readNumber(raw, 'id');
  const taskId = readNumber(raw, 'taskId');

  if (id === null || taskId === null) return null;

  return {
    id,
    taskId,
    fileName: readString(raw, 'fileName') ?? 'dosya',
    contentType: readString(raw, 'contentType') ?? 'application/octet-stream',
    sizeBytes: readNumber(raw, 'sizeBytes') ?? 0,
    uploadedByUserId: readNumber(raw, 'uploadedByUserId'),
    uploadedByName: readString(raw, 'uploadedByName'),
    createdAt: readString(raw, 'createdAt') ?? new Date().toISOString(),
  };
}

export function parseAttachmentList(raw: unknown): TaskAttachment[] {
  if (!Array.isArray(raw)) return [];

  return raw.map(parseAttachment).filter((item): item is TaskAttachment => item !== null);
}
