import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { I18nService } from '../../core/i18n/i18n.service';
import { TaskItem, TaskItemStatus } from '../../core/models/task.model';
import { UserSummary } from '../../core/models/user.model';
import { TaskStore } from '../../core/services/task.store';
import { UserDirectoryService } from '../../core/services/user-directory.service';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm.service';
import {
  Translate,
  assignConfirm,
  claimConfirm,
  deleteConfirm,
  moveConfirm,
  unassignConfirm,
} from './task-confirm';
import { TaskDialogComponent, TaskDialogData } from './task-dialog/task-dialog.component';

/**
 * İş üzerindeki kritik aksiyonların tek giriş noktası.
 *
 * Kart, liste satırı, "..." menüsü ve sürükle-bırak aynı işlemleri
 * tetikliyor; hepsi buradan geçiyor ki kullanıcı işlemi nereden başlatırsa
 * başlatsın aynı soruyu görsün ve onay kuralı tek yerde dursun.
 *
 * Metotlar kullanıcının kararını `Promise<boolean>` olarak döndürüyor -
 * sürükle-bırak tarafı kartın akıbetini buna göre yönetiyor.
 */
@Injectable({ providedIn: 'root' })
export class TaskActionsService {
  private readonly dialog = inject(MatDialog);
  private readonly i18n = inject(I18nService);

  /** Onay metinlerine geçilen çevirici (bkz. task-confirm.ts). */
  private readonly t: Translate = (key, params) => this.i18n.t(key, params);
  private readonly confirm = inject(ConfirmService);
  private readonly store = inject(TaskStore);
  private readonly users = inject(UserDirectoryService);

  // --- Onay gerektirmeyenler ----------------------------------------------
  // Pencere açmak tek başına bir şeyi değiştirmiyor; onay kaydederken alınıyor.

  openCreateDialog(): void {
    this.dialog.open(TaskDialogComponent, { autoFocus: false });
  }

  openEditDialog(task: TaskItem): void {
    const data: TaskDialogData = { task };
    this.dialog.open(TaskDialogComponent, { data, autoFocus: false });
  }

  // --- Onaylı aksiyonlar ---------------------------------------------------

  /** Boştaki işi üstlenir. */
  async claim(task: TaskItem): Promise<boolean> {
    const confirmed = await this.confirm.ask(claimConfirm(this.t, task));

    if (confirmed) this.store.claim(task.id);
    return confirmed;
  }

  /** İşi bir kullanıcıya atar ya da başkasına devreder. */
  async assignTo(task: TaskItem, user: UserSummary): Promise<boolean> {
    const targetPhrase = this.users.isMe(user.id)
      ? this.i18n.t('assign.toYou')
      : this.i18n.t('assign.toPerson', { name: user.fullName });

    const currentName =
      task.assignedUserId === null ? null : this.users.displayName(task.assignedUserId);

    const confirmed = await this.confirm.ask(
      assignConfirm(this.t, task, targetPhrase, currentName),
    );

    if (confirmed) this.store.assignTo(task, user.id);
    return confirmed;
  }

  /** Atamayı kaldırır; iş havuza döner. */
  async unassign(task: TaskItem): Promise<boolean> {
    const confirmed = await this.confirm.ask(
      unassignConfirm(this.t, task, this.users.displayName(task.assignedUserId)),
    );

    if (confirmed) this.store.unassign(task.id);
    return confirmed;
  }

  /**
   * Durum değişikliği - hem sürükle-bırakın hem kart menüsünün girişi.
   *
   * "Boşta -> Devam ediyor" geçişi işi üstlenmek demek, bu yüzden üstlenme
   * onayına yönlendiriliyor: kullanıcıya sorulan soru da yaptığı işle aynı
   * anlama gelsin.
   */
  async moveTo(task: TaskItem, target: TaskItemStatus): Promise<boolean> {
    if (task.status === target) return false;

    if (target === TaskItemStatus.Taken && task.status === TaskItemStatus.Open) {
      return this.claim(task);
    }

    const confirmed = await this.confirm.ask(moveConfirm(this.t, task, target));

    if (confirmed) this.store.moveTo(task, target);
    return confirmed;
  }

  /** İşi kalıcı olarak siler. */
  async remove(task: TaskItem): Promise<boolean> {
    const confirmed = await this.confirm.ask(deleteConfirm(this.t, task));

    if (confirmed) this.store.remove(task.id);
    return confirmed;
  }
}
