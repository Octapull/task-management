import { MessageKey } from '../../core/i18n/messages';
import { TASK_STATUS_KEYS, TaskItem, TaskItemStatus } from '../../core/models/task.model';
import { ConfirmDialogData } from '../../shared/ui/confirm-dialog/confirm-dialog.component';

/**
 * Onay pencerelerinin metinleri.
 *
 * Saf fonksiyonlar: hiçbir servise bağlı değiller, yalnızca işi, gereken
 * isimleri ve bir çeviriciyi alıp pencere içeriğini kuruyorlar. Bu ayrım
 * sayesinde hem `TaskActionsService` hem de iş düzenleme penceresi aynı
 * metinleri kullanabiliyor; aralarında dairesel import oluşmuyor.
 *
 * Çeviriciyi enjekte etmek yerine parametre olarak almalarının sebebi de bu:
 * `I18nService`'i içe aktarmak modülü Angular'ın enjeksiyon bağlamına
 * bağlardı ve saflığı bozardı. Çağıran taraf zaten servise sahip.
 *
 * Metinler hep aynı kalıpta: başlık soru, mesaj "ne olacağını" anlatır,
 * `details` ise durum değişimini tek satırda gösterir.
 */
export type Translate = (
  key: MessageKey,
  params?: Record<string, string | number>,
) => string;

/** "Boşta → Devam ediyor" biçiminde tek satırlık geçiş özeti. */
function statusFlow(t: Translate, from: TaskItemStatus, to: TaskItemStatus): string {
  return t('confirm.statusFlow', {
    from: t(TASK_STATUS_KEYS[from]),
    to: t(TASK_STATUS_KEYS[to]),
  });
}

export function claimConfirm(t: Translate, task: TaskItem): ConfirmDialogData {
  return {
    title: t('confirm.claim.title'),
    message: t('confirm.claim.message'),
    subject: task.title,
    details: statusFlow(t, task.status, TaskItemStatus.Taken),
    confirmLabel: t('confirm.claim.action'),
    tone: 'accent',
    icon: 'user-plus',
  };
}

/**
 * @param targetPhrase "sana" ya da "Ayşe Yılmaz adlı kişiye" - cümleye
 * doğrudan giren, dile göre çözülmüş hazır ifade.
 * @param currentName İşin şu anki sahibi; atanmamışsa null.
 */
export function assignConfirm(
  t: Translate,
  task: TaskItem,
  targetPhrase: string,
  currentName: string | null,
): ConfirmDialogData {
  const isTransfer = currentName !== null;
  const leavesPool = task.status === TaskItemStatus.Open;

  const message = isTransfer
    ? t('confirm.assign.messageTransfer', {
        current: currentName,
        target: targetPhrase,
      })
    : t('confirm.assign.message', { target: targetPhrase }) +
      (leavesPool ? t('confirm.assign.messagePool') : '');

  return {
    title: isTransfer ? t('confirm.assign.titleTransfer') : t('confirm.assign.title'),
    message,
    subject: task.title,
    // Durum değişmiyorsa geçiş satırını göstermenin anlamı yok.
    details: leavesPool ? statusFlow(t, task.status, TaskItemStatus.Taken) : undefined,
    confirmLabel: isTransfer
      ? t('confirm.assign.actionTransfer')
      : t('confirm.assign.action'),
    tone: 'accent',
    icon: 'users',
  };
}

export function unassignConfirm(
  t: Translate,
  task: TaskItem,
  currentName: string,
): ConfirmDialogData {
  return {
    title: t('confirm.unassign.title'),
    message: t('confirm.unassign.message', { current: currentName }),
    subject: task.title,
    details: statusFlow(t, task.status, TaskItemStatus.Open),
    confirmLabel: t('confirm.unassign.action'),
    tone: 'warning',
    icon: 'inbox',
  };
}

/**
 * Durum değişikliği. "Boşta → Devam ediyor" buraya gelmiyor; o geçiş işi
 * üstlenmek demek ve `claimConfirm` ile soruluyor.
 */
export function moveConfirm(
  t: Translate,
  task: TaskItem,
  target: TaskItemStatus,
): ConfirmDialogData {
  const base = { subject: task.title, details: statusFlow(t, task.status, target) };

  switch (target) {
    case TaskItemStatus.Completed:
      return {
        ...base,
        title: t('confirm.complete.title'),
        message: t('confirm.complete.message'),
        confirmLabel: t('confirm.complete.action'),
        tone: 'success',
        icon: 'circle-check',
      };

    case TaskItemStatus.Open:
      return {
        ...base,
        title: t('confirm.toPool.title'),
        message: t('confirm.toPool.message'),
        confirmLabel: t('confirm.toPool.action'),
        tone: 'warning',
        icon: 'inbox',
      };

    default:
      // Tamamlanmış işin "Devam Edenler"e geri alınması.
      return {
        ...base,
        title: t('confirm.reopen.title'),
        message: t('confirm.reopen.message'),
        confirmLabel: t('confirm.reopen.action'),
        tone: 'warning',
        icon: 'refresh',
      };
  }
}

export function deleteConfirm(t: Translate, task: TaskItem): ConfirmDialogData {
  return {
    title: t('confirm.delete.title'),
    message: t('confirm.delete.message'),
    subject: task.title,
    confirmLabel: t('common.delete'),
    tone: 'danger',
    icon: 'trash',
  };
}

/**
 * İçerik güncellemesi onay gerektiriyor mu?
 *
 * Her kaydetmede sormuyoruz - kendi üzerindeki işi düzenlemek sıradan bir
 * işlem ve her seferinde pencere açmak yalnızca yorucu olurdu. Yalnızca
 * başkasının üzerindeki ya da tamamlanmış bir işe dokunulduğunda soruyoruz:
 * bu iki durumda değişiklik başka birinin gördüğü işi etkiliyor.
 */
export function isCriticalUpdate(task: TaskItem, assignedToSomeoneElse: boolean): boolean {
  return assignedToSomeoneElse || task.status === TaskItemStatus.Completed;
}

export function criticalUpdateConfirm(
  t: Translate,
  task: TaskItem,
  assigneeName: string,
): ConfirmDialogData {
  const isCompleted = task.status === TaskItemStatus.Completed;

  return {
    title: t('confirm.update.title'),
    message: isCompleted
      ? t('confirm.update.messageCompleted')
      : t('confirm.update.messageAssigned', { name: assigneeName }),
    subject: task.title,
    confirmLabel: t('common.save'),
    tone: 'warning',
    icon: 'flag',
  };
}
