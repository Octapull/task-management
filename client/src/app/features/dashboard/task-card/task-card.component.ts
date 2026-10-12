import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import {
  TASK_PRIORITY_KEYS,
  TASK_STATUS_KEYS,
  TaskItem,
  TaskItemStatus,
  TaskPriority,
} from '../../../core/models/task.model';
import { UserDirectoryService } from '../../../core/services/user-directory.service';
import {
  formatDueDate,
  formatDuration,
  formatFullDate,
  formatRelative,
  formatShortDate,
  isDueSoon,
  isPastDue,
} from '../../../shared/util/date';

/** Kartın alt satırındaki başlangıç/bitiş rozeti. */
interface TimelineBadge {
  icon: 'clock' | 'circle-check';
  label: string;
  tooltip: string;
}
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { LabelStore } from '../../../core/services/label.store';
import { LabelChipComponent } from '../../../shared/ui/label-chip/label-chip.component';
import { TaskActionsService } from '../task-actions.service';
import { TaskMenuComponent } from '../task-menu/task-menu.component';
import { I18nService } from '../../../core/i18n/i18n.service';

/**
 * Kanban panosundaki iş kartı.
 *
 * Sürükleme davranışını kartın kendisi değil, onu saran pano tanımlıyor;
 * böylece kart başka bir yerleşimde de kullanılabiliyor.
 */
@Component({
  selector: 'app-task-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, MatTooltipModule, TaskMenuComponent, RouterLink, LabelChipComponent],
  templateUrl: './task-card.component.html',
  styleUrl: './task-card.component.scss',
})
export class TaskCardComponent {
  private readonly actions = inject(TaskActionsService);
  private readonly labelStore = inject(LabelStore);
  private readonly users = inject(UserDirectoryService);
  protected readonly i18n = inject(I18nService);

  readonly task = input.required<TaskItem>();

  protected readonly isCompleted = computed(() => this.task().status === TaskItemStatus.Completed);

  protected readonly isUnassigned = computed(() => this.task().assignedUserId === null);

  protected readonly isMine = computed(() => this.users.isMe(this.task().assignedUserId));

  protected readonly assigneeName = computed(() =>
    this.users.displayName(this.task().assignedUserId),
  );

  protected readonly assigneeInitials = computed(() =>
    this.users.initials(this.task().assignedUserId),
  );

  protected readonly creatorInitials = computed(() =>
    this.users.initials(this.task().createdByUserId),
  );

  protected readonly creatorTooltip = computed(() =>
    this.i18n.t('card.creator', {
      name: this.users.displayName(this.task().createdByUserId),
    }),
  );

  /**
   * Oluşturan kişi ayrı bir avatarla gösterilsin mi?
   * Atanan kişiyle aynıysa ya da bilinmiyorsa gereksiz - kart kalabalıklaşmasın.
   */
  protected readonly showCreator = computed(() => {
    const task = this.task();
    return task.createdByUserId !== null && task.createdByUserId !== task.assignedUserId;
  });

  protected readonly statusLabel = computed(() =>
    this.i18n.t(TASK_STATUS_KEYS[this.task().status]),
  );

  protected readonly priorityLabel = computed(() =>
    this.i18n.t(TASK_PRIORITY_KEYS[this.task().priority]),
  );

  /** Yüksek kırmızı, orta mor; düşük öncelik nötr kalıyor. */
  protected readonly priorityClass = computed(() => {
    switch (this.task().priority) {
      case TaskPriority.High:
        return 'badge--danger';
      case TaskPriority.Medium:
        return 'badge--purple';
      default:
        return '';
    }
  });

  protected readonly priorityIcon = computed(() => {
    switch (this.task().priority) {
      case TaskPriority.High:
        return 'arrow-up' as const;
      case TaskPriority.Low:
        return 'arrow-down' as const;
      default:
        return 'minus' as const;
    }
  });

  protected readonly statusClass = computed(() => {
    switch (this.task().status) {
      case TaskItemStatus.Completed:
        return 'badge--success';
      case TaskItemStatus.Taken:
        return 'badge--info';
      default:
        return '';
    }
  });

  protected readonly dueLabel = computed(() => formatDueDate(this.task().dueDate));

  /** Geçmiş tarih kırmızı, bugün/yarın sarı, diğerleri nötr. */
  protected readonly dueClass = computed(() => {
    const task = this.task();
    if (task.status === TaskItemStatus.Completed) return '';
    if (isPastDue(task.dueDate)) return 'badge--danger';
    if (isDueSoon(task.dueDate)) return 'badge--warning';
    return '';
  });

  protected readonly isOverdue = computed(
    () => !this.isCompleted() && isPastDue(this.task().dueDate),
  );

  /**
   * Devam eden işte ne kadardır sürdüğü, tamamlanan işte başlangıç -> bitiş
   * aralığı. Boştaki işlerde başlangıç olmadığı için rozet de yok.
   *
   * Kartta yer dar olduğu için rozette kısa biçim, tam tarihler ipucunda.
   */
  protected readonly timeline = computed<TimelineBadge | null>(() => {
    const task = this.task();
    if (task.startedAt === null) return null;

    const started = this.i18n.t('task.startedAt', {
      when: formatFullDate(task.startedAt),
    });

    if (task.status === TaskItemStatus.Completed && task.completedAt !== null) {
      return {
        icon: 'circle-check',
        label: `${formatShortDate(task.startedAt)} → ${formatShortDate(task.completedAt)}`,
        tooltip: [
          started,
          this.i18n.t('task.finishedAt', { when: formatFullDate(task.completedAt) }),
          this.i18n.t('task.duration', {
            value: formatDuration(task.startedAt, task.completedAt),
          }),
        ].join(' · '),
      };
    }

    if (task.status === TaskItemStatus.Taken) {
      return {
        icon: 'clock',
        label: formatDuration(task.startedAt),
        tooltip: [
          started,
          this.i18n.t('task.duration', { value: formatDuration(task.startedAt) }),
        ].join(' · '),
      };
    }

    return null;
  });

  protected readonly titleTooltip = computed(() => {
    const task = this.task();
    const created = this.i18n.t('task.createdAt', {
      when: formatRelative(task.createdAt),
    });

    if (!task.completedAt) return created;

    const done = this.i18n.t('task.completedAt', {
      when: formatFullDate(task.completedAt),
    });

    return `${created} · ${done}`;
  });

  /** Takılı etiketlerin çözülmüş hali; tanınmayan id'ler atlanıyor. */
  protected readonly labels = computed(() => this.labelStore.resolve(this.task().labelIds));

  protected claim(): void {
    void this.actions.claim(this.task());
  }
}
