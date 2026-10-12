import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';

import { TaskItem, TaskItemStatus } from '../../../core/models/task.model';
import { UserSummary } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { UserDirectoryService } from '../../../core/services/user-directory.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { TaskActionsService } from '../task-actions.service';
import { I18nService } from '../../../core/i18n/i18n.service';

/**
 * Bir işin "..." menüsü. Hem kartta hem liste satırında aynısı kullanılıyor,
 * bu yüzden ayrı bir bileşen: menü seçenekleri iki yerde ayrışmasın.
 */
@Component({
  selector: 'app-task-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatMenuModule, IconComponent],
  templateUrl: './task-menu.component.html',
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class TaskMenuComponent {
  private readonly actions = inject(TaskActionsService);
  private readonly users = inject(UserDirectoryService);
  protected readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);

  readonly task = input.required<TaskItem>();

  protected readonly Status = TaskItemStatus;

  /** Atama alt menüsü: işin şu anki sahibi listede tekrar gösterilmiyor. */
  protected readonly assignableUsers = computed(() =>
    this.users.users().filter((user) => user.id !== this.task().assignedUserId),
  );

  /**
   * Silme yetkisi - backend'deki kuralın aynısı: işi açan kişi ya da ekip
   * sahibi. Asıl kontrol sunucuda; buradaki kopya yalnızca kullanıcıya
   * yapamayacağı bir seçeneği göstermemek için.
   */
  protected readonly canDelete = computed(() => {
    const createdBy = this.task().createdByUserId;

    return this.auth.isOwner() || (createdBy !== null && createdBy === this.auth.userId());
  });

  protected readonly isUnassigned = computed(() => this.task().assignedUserId === null);

  protected userLabel(user: UserSummary): string {
    return this.users.isMe(user.id)
      ? this.i18n.t('menu.you', { name: user.fullName })
      : user.fullName;
  }

  protected moveTo(status: TaskItemStatus): void {
    void this.actions.moveTo(this.task(), status);
  }

  protected assignTo(user: UserSummary): void {
    void this.actions.assignTo(this.task(), user);
  }

  protected unassign(): void {
    void this.actions.unassign(this.task());
  }

  protected edit(): void {
    this.actions.openEditDialog(this.task());
  }

  protected remove(): void {
    void this.actions.remove(this.task());
  }
}
