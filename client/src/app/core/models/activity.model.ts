import { MessageKey } from '../i18n/messages';
import { IconName } from '../../shared/ui/icon/icon.constants';

/**
 * İşlem geçmişi kayıtları (GET /api/activity).
 *
 * Sayısal değerler backend'deki `Enums/ActivityAction.cs` ile birebir aynı
 * olmak zorunda - veritabanına sayı olarak yazılıyorlar.
 */

export enum ActivityAction {
  TaskCreated = 0,
  TaskUpdated = 1,
  TaskDeleted = 2,
  /** Kullanıcı boştaki işi kendi üstlendi. */
  TaskClaimed = 3,
  /** Atama kaldırıldı, iş havuza döndü. */
  TaskReleased = 4,
  /** İş başkasına atandı / devredildi. */
  TaskAssigned = 5,
  TaskCompleted = 6,
  TaskReopened = 7,
}

/** Sayfalanmış geçmiş yanıtı (GET /api/activity). */
export interface ActivityPage {
  entries: ActivityEntry[];
  /** Ekipteki toplam kayıt sayısı - sayfa değil, tümü. */
  total: number;
  hasMore: boolean;
}

export interface ActivityEntry {
  id: number;
  /** İş silinmiş olabilir; kayıt yine de duruyor. */
  taskId: number | null;
  /** İşlem anındaki başlık - iş silinse de görünsün diye kopyalanıyor. */
  taskTitle: string;
  action: ActivityAction;
  actorUserId: number | null;
  actorName: string | null;
  /** Yalnızca devir işleminde dolu. */
  targetUserId: number | null;
  targetName: string | null;
  /** Serbest metin ayrıntı, ör. "öncelik (Orta -> Yüksek)". */
  details: string | null;
  createdAt: string;
}

/** Geçmiş satırındaki fiil - "<kişi> <fiil>". */
/**
 * Satır metni artık tek bir fiil değil, TAM CÜMLE şablonu tutuyor.
 *
 * Sebep kelime sırası: Türkçede “Ayşe işi Mehmet kişisine devretti”, İngilizcede
 * “Ayşe handed the task to Mehmet”. Parçaları sabit sırada dizmek dört dilde
 * bozuk cümle üretirdi. Şablondaki {actor} / {target} / {task} yer tutucularını
 * bileşen parçalara ayırıp her birine kendi biçimini veriyor.
 */
export const ACTIVITY_SENTENCE_KEYS: Record<ActivityAction, MessageKey> = {
  [ActivityAction.TaskCreated]: 'activity.sentence.created',
  [ActivityAction.TaskUpdated]: 'activity.sentence.updated',
  [ActivityAction.TaskDeleted]: 'activity.sentence.deleted',
  [ActivityAction.TaskClaimed]: 'activity.sentence.claimed',
  [ActivityAction.TaskReleased]: 'activity.sentence.released',
  [ActivityAction.TaskAssigned]: 'activity.sentence.assigned',
  [ActivityAction.TaskCompleted]: 'activity.sentence.completed',
  [ActivityAction.TaskReopened]: 'activity.sentence.reopened',
};

/** Filtre çubuğunda kullanılan gruplar. */
export type ActivityFilter = 'all' | 'mine' | 'assignment' | 'lifecycle';

/**
 * Rozet rengi: sınıf adları `_primitives.scss` içindeki rozet çeşitleri.
 * Renk anlamı taşıyor - tamamlama yeşil, silme kırmızı, atama mor.
 */
export const ACTIVITY_BADGE: Record<ActivityAction, string> = {
  [ActivityAction.TaskCreated]: 'badge--info',
  [ActivityAction.TaskUpdated]: '',
  [ActivityAction.TaskDeleted]: 'badge--danger',
  [ActivityAction.TaskClaimed]: 'badge--purple',
  [ActivityAction.TaskReleased]: 'badge--warning',
  [ActivityAction.TaskAssigned]: 'badge--purple',
  [ActivityAction.TaskCompleted]: 'badge--success',
  [ActivityAction.TaskReopened]: 'badge--warning',
};

/** Satır başındaki simge. */
export const ACTIVITY_ICON: Record<ActivityAction, IconName> = {
  [ActivityAction.TaskCreated]: 'plus',
  [ActivityAction.TaskUpdated]: 'clipboard-list',
  [ActivityAction.TaskDeleted]: 'trash',
  [ActivityAction.TaskClaimed]: 'user-plus',
  [ActivityAction.TaskReleased]: 'inbox',
  [ActivityAction.TaskAssigned]: 'users',
  [ActivityAction.TaskCompleted]: 'circle-check',
  [ActivityAction.TaskReopened]: 'refresh',
};
