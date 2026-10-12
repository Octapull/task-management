import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import {
  TASK_PRIORITY_KEYS,
  TASK_STATUS_KEYS,
  TaskItem,
  TaskItemStatus,
  TaskPriority,
} from '../../../core/models/task.model';
import { TaskStore } from '../../../core/services/task.store';
import { UserDirectoryService } from '../../../core/services/user-directory.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import {
  formatDueDate,
  formatDuration,
  formatFullDate,
  formatRelative,
  formatShortDate,
  isDueSoon,
  isPastDue,
} from '../../../shared/util/date';
import { TaskActionsService } from '../task-actions.service';
import { TaskMenuComponent } from '../task-menu/task-menu.component';
import { I18nService } from '../../../core/i18n/i18n.service';

type SortKey = 'title' | 'priority' | 'status' | 'dueDate' | 'createdAt' | 'startedAt';
type SortDirection = 'asc' | 'desc';

/**
 * Liste görünümü.
 *
 * Panonun aynı verisini tablo olarak gösterir; çok sayıda iş olduğunda
 * karşılaştırma ve tarama panodan daha kolay. Sıralama tamamen istemci
 * tarafında - backend'de sıralama parametresi yok.
 */
@Component({
  selector: 'app-task-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, MatTooltipModule, TaskMenuComponent, RouterLink],
  templateUrl: './task-list.component.html',
  styleUrl: './task-list.component.scss',
})
export class TaskListComponent {
  private readonly users = inject(UserDirectoryService);
  protected readonly i18n = inject(I18nService);
  private readonly actions = inject(TaskActionsService);
  protected readonly store = inject(TaskStore);

  protected readonly sortKey = signal<SortKey>('createdAt');
  protected readonly sortDirection = signal<SortDirection>('desc');

  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  protected readonly rows = computed(() => {
    const key = this.sortKey();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;

    return [...this.store.filteredTasks()].sort((a, b) => compare(a, b, key) * direction);
  });

  protected sortBy(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }

    this.sortKey.set(key);
    // Metin alanları A'dan Z'ye, sayısal/tarihsel alanlar büyükten küçüğe
    // başlasın - her ikisi de kullanıcının beklediği ilk sıralama.
    this.sortDirection.set(key === 'title' ? 'asc' : 'desc');
  }

  protected sortIcon(key: SortKey): 'arrow-up' | 'arrow-down' {
    return this.sortDirection() === 'asc' ? 'arrow-up' : 'arrow-down';
  }

  protected openCreateDialog(): void {
    this.actions.openCreateDialog();
  }

  // --- Satır biçimlendirme -------------------------------------------------

  protected statusLabel(task: TaskItem): string {
    return this.i18n.t(TASK_STATUS_KEYS[task.status]);
  }

  protected statusClass(task: TaskItem): string {
    switch (task.status) {
      case TaskItemStatus.Completed:
        return 'badge--success';
      case TaskItemStatus.Taken:
        return 'badge--info';
      default:
        return '';
    }
  }

  protected priorityLabel(task: TaskItem): string {
    return this.i18n.t(TASK_PRIORITY_KEYS[task.priority]);
  }

  /** Yüksek kırmızı, orta mor; düşük öncelik nötr kalıyor. */
  protected priorityClass(task: TaskItem): string {
    switch (task.priority) {
      case TaskPriority.High:
        return 'badge--danger';
      case TaskPriority.Medium:
        return 'badge--purple';
      default:
        return '';
    }
  }

  protected priorityIcon(task: TaskItem): 'arrow-up' | 'arrow-down' | 'minus' {
    switch (task.priority) {
      case TaskPriority.High:
        return 'arrow-up';
      case TaskPriority.Low:
        return 'arrow-down';
      default:
        return 'minus';
    }
  }

  protected dueLabel(task: TaskItem): string {
    return formatDueDate(task.dueDate) || '—';
  }

  protected dueClass(task: TaskItem): string {
    if (task.status === TaskItemStatus.Completed) return '';
    if (isPastDue(task.dueDate)) return 'cell--danger';
    if (isDueSoon(task.dueDate)) return 'cell--warning';
    return '';
  }

  protected createdLabel(task: TaskItem): string {
    return formatRelative(task.createdAt);
  }

  protected createdTooltip(task: TaskItem): string {
    return formatFullDate(task.createdAt);
  }

  /** Başlangıç sütunu: tarih; boştaki işlerde tire. */
  protected startedLabel(task: TaskItem): string {
    return formatShortDate(task.startedAt) || '—';
  }

  protected startedTooltip(task: TaskItem): string {
    if (task.startedAt === null) return this.i18n.t('task.notStarted');

    // Devam eden işte "ne zamandır sürüyor", tamamlanmışta toplam süre.
    const elapsed =
      task.status === TaskItemStatus.Completed
        ? formatDuration(task.startedAt, task.completedAt)
        : formatDuration(task.startedAt);

    return [
      this.i18n.t('task.startedAt', { when: formatFullDate(task.startedAt) }),
      this.i18n.t('task.duration', { value: elapsed }),
    ].join(' · ');
  }

  /** Bitiş sütunu: yalnızca tamamlanan işlerde dolu. */
  protected completedLabel(task: TaskItem): string {
    return formatShortDate(task.completedAt) || '—';
  }

  protected completedTooltip(task: TaskItem): string {
    if (task.completedAt === null) return this.i18n.t('task.notCompleted');

    return this.i18n.t('task.completedAt', {
      when: formatFullDate(task.completedAt),
    });
  }

  protected assigneeName(task: TaskItem): string {
    return this.users.displayName(task.assignedUserId);
  }

  protected assigneeInitials(task: TaskItem): string {
    return this.users.initials(task.assignedUserId);
  }

  protected isMine(task: TaskItem): boolean {
    return this.users.isMe(task.assignedUserId);
  }

  protected creatorName(task: TaskItem): string {
    return task.createdByUserId === null
      ? 'Bilinmiyor'
      : this.users.displayName(task.createdByUserId);
  }

  protected claim(task: TaskItem): void {
    void this.actions.claim(task);
  }
}

function compare(a: TaskItem, b: TaskItem, key: SortKey): number {
  switch (key) {
    case 'title':
      return a.title.localeCompare(b.title, 'tr');
    case 'priority':
      return a.priority - b.priority;
    case 'status':
      return a.status - b.status;
    case 'dueDate':
      // Tarihi olmayanlar her zaman en sona.
      if (a.dueDate === null && b.dueDate === null) return 0;
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    case 'startedAt':
      // Henüz başlanmamış işler (boştakiler) listenin sonuna.
      if (a.startedAt === null && b.startedAt === null) return 0;
      if (a.startedAt === null) return 1;
      if (b.startedAt === null) return -1;
      return a.startedAt.localeCompare(b.startedAt);
    default:
      return a.createdAt.localeCompare(b.createdAt);
  }
}
