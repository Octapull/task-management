import { MessageKey } from '../i18n/messages';

/**
 * Backend'deki TaskItem entity'sinin ve enum'larının birebir karşılığı.
 *
 * Backend enum'ları JSON'a sayı olarak yazıyor (0/1/2), string olarak değil -
 * bu yüzden burada da sayısal enum kullanıyoruz. Değerler
 * `Enums/TaskItemStatus.cs` ve `Enums/TaskPriority.cs` ile aynı olmak zorunda.
 */

export enum TaskItemStatus {
  /** Boşta - kimse üstlenmemiş. */
  Open = 0,
  /** Alınmış - bir kullanıcı üstlenmiş, devam ediyor. */
  Taken = 1,
  /** Tamamlanmış. */
  Completed = 2,
}

export enum TaskPriority {
  Low = 0,
  Medium = 1,
  High = 2,
}

export interface TaskItem {
  id: number;
  title: string;
  description: string;
  status: TaskItemStatus;
  priority: TaskPriority;
  /** ISO 8601 tarih metni; atanmamışsa null. */
  dueDate: string | null;
  assignedUserId: number | null;
  /** İşi oluşturan kullanıcı; sütun sonradan eklendiği için eski kayıtlarda null. */
  createdByUserId: number | null;
  createdAt: string;
  /** İşin üstlenildiği an; boştaki işlerde null. */
  startedAt: string | null;
  completedAt: string | null;
  /** Kontrol listesi sayaçları - kartta "3/5" rozeti için iş sorgusunda geliyor. */
  checklistTotal: number;
  checklistDone: number;
  /** Takılı etiketlerin id'leri; ad ve renk LabelStore'dan çözülüyor. */
  labelIds: number[];
}

/**
 * POST /api/tasks ve PUT /api/tasks/{id} gövdesi.
 * Durum, atama ve oluşturan bilgisini backend kendisi yönetiyor.
 */
export interface TaskContentRequest {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string | null;
}

/**
 * Durum ve öncelik etiketleri artık metin değil çeviri ANAHTARI tutuyor:
 * ekranda görünen karşılık dile göre çözülüyor (I18nService.t).
 */
export const TASK_STATUS_KEYS: Record<TaskItemStatus, MessageKey> = {
  [TaskItemStatus.Open]: 'status.open',
  [TaskItemStatus.Taken]: 'status.taken',
  [TaskItemStatus.Completed]: 'status.completed',
};

export const TASK_PRIORITY_KEYS: Record<TaskPriority, MessageKey> = {
  [TaskPriority.Low]: 'priority.low',
  [TaskPriority.Medium]: 'priority.medium',
  [TaskPriority.High]: 'priority.high',
};

/** Kanban kolonlarının soldan sağa sırası. */
export const BOARD_COLUMNS: readonly TaskItemStatus[] = [
  TaskItemStatus.Open,
  TaskItemStatus.Taken,
  TaskItemStatus.Completed,
] as const;

/**
 * Bir işe yazılan yorum (GET /api/tasks/{id}/comments).
 *
 * ActivityEntry ile karıştırılmamalı: geçmiş kaydı sistemin otomatik tuttuğu
 * denetim izi, yorum kullanıcının bilerek yazdığı metin.
 */
export interface TaskComment {
  id: number;
  taskId: number;
  authorUserId: number | null;
  /** Yazarın adı; kullanıcı silinmişse null. */
  authorName: string | null;
  body: string;
  createdAt: string;
  /** Düzenlenmemiş yorumlarda null. */
  editedAt: string | null;
}

/** Bir işin kontrol listesindeki tek adım. */
export interface ChecklistItem {
  id: number;
  taskId: number;
  title: string;
  isDone: boolean;
  /** Listedeki sırası; sürükleyerek değiştirilebiliyor. */
  position: number;
  createdAt: string;
  completedAt: string | null;
}

/** Bir işe yüklenen dosya (GET /api/tasks/{id}/attachments). */
export interface TaskAttachment {
  id: number;
  taskId: number;
  /** Kullanıcının yüklediği özgün ad. */
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUserId: number | null;
  uploadedByName: string | null;
  createdAt: string;
}
