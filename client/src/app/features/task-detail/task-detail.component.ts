import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { ActivityEntry } from '../../core/models/activity.model';
import {
  DEFAULT_LABEL_COLOR,
  LABEL_COLORS,
  Label,
  LabelColor,
} from '../../core/models/label.model';
import {
  ChecklistItem,
  TASK_PRIORITY_KEYS,
  TASK_STATUS_KEYS,
  TaskAttachment,
  TaskComment,
  TaskItem,
  TaskItemStatus,
  TaskPriority,
} from '../../core/models/task.model';
import { ActivityApiService } from '../../core/services/activity-api.service';
import { AuthService } from '../../core/services/auth.service';
import { LabelStore } from '../../core/services/label.store';
import { NotifyService } from '../../core/services/notify.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { TaskApiService } from '../../core/services/task-api.service';
import { TaskStore } from '../../core/services/task.store';
import { UserDirectoryService } from '../../core/services/user-directory.service';
import { extractErrorMessage } from '../../core/util/http-error';
import { TaskActionsService } from '../dashboard/task-actions.service';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { LabelChipComponent } from '../../shared/ui/label-chip/label-chip.component';
import { TaskMenuComponent } from '../dashboard/task-menu/task-menu.component';
import { formatFullDate, formatRelative } from '../../shared/util/date';
import { I18nService } from '../../core/i18n/i18n.service';

type DetailTab = 'comments' | 'activity';

/**
 * Tek bir işin ayrıntı sayfası: bilgileri, yorumlar ve o işe ait geçmiş.
 *
 * İş kaydı öncelikle TaskStore'dan okunuyor - orası SignalR ile canlı
 * kalıyor, yani başka biri işi üstlendiğinde bu sayfa da kendiliğinden
 * güncelleniyor. Store'da yoksa (adres çubuğundan doğrudan gelindiyse)
 * API'den çekiliyor.
 */
@Component({
  selector: 'app-task-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatTooltipModule,
    MatMenuModule,
    CdkDropList,
    CdkDrag,
    IconComponent,
    LabelChipComponent,
    TaskMenuComponent,
  ],
  templateUrl: './task-detail.component.html',
  styleUrl: './task-detail.component.scss',
})
export class TaskDetailComponent {
  private readonly api = inject(TaskApiService);
  private readonly activityApi = inject(ActivityApiService);
  private readonly store = inject(TaskStore);
  private readonly realtime = inject(RealtimeService);
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserDirectoryService);
  private readonly labelStore = inject(LabelStore);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly actions = inject(TaskActionsService);
  protected readonly i18n = inject(I18nService);
  private readonly formBuilder = inject(FormBuilder);

  /** Rota parametresi (withComponentInputBinding ile bağlanıyor). */
  readonly id = input.required<number, string>({ transform: numberAttribute });

  private readonly fetched = signal<TaskItem | null>(null);

  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  protected readonly comments = signal<TaskComment[]>([]);
  protected readonly checklist = signal<ChecklistItem[]>([]);
  protected readonly attachments = signal<TaskAttachment[]>([]);
  protected readonly uploading = signal(false);
  protected readonly busyAttachmentId = signal<number | null>(null);
  protected readonly activity = signal<ActivityEntry[]>([]);

  protected readonly tab = signal<DetailTab>('comments');
  protected readonly posting = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly busyCommentId = signal<number | null>(null);

  protected statusLabel(status: TaskItemStatus): string {
    return this.i18n.t(TASK_STATUS_KEYS[status]);
  }

  protected priorityLabel(priority: TaskPriority): string {
    return this.i18n.t(TASK_PRIORITY_KEYS[priority]);
  }
  protected readonly Status = TaskItemStatus;

  protected readonly commentForm = this.formBuilder.nonNullable.group({
    body: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  protected readonly editForm = this.formBuilder.nonNullable.group({
    body: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  protected readonly newItemForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(300)]],
  });

  protected readonly itemEditForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(300)]],
  });

  protected readonly addingItem = signal(false);
  protected readonly editingItemId = signal<number | null>(null);

  protected readonly doneCount = computed(
    () => this.checklist().filter((item) => item.isDone).length,
  );

  /** İlerleme çubuğunun genişliği (%). Liste boşken 0. */
  protected readonly progress = computed(() => {
    const total = this.checklist().length;
    if (total === 0) return 0;

    return Math.round((this.doneCount() / total) * 100);
  });

  /** Store canlı kaynak; yoksa doğrudan çekilen kayda düşüyoruz. */
  private readonly storeTask = computed(() =>
    this.store.tasks().find((task) => task.id === this.id()),
  );

  protected readonly task = computed<TaskItem | null>(() => this.storeTask() ?? this.fetched());

  protected readonly assigneeName = computed(() =>
    this.users.displayName(this.task()?.assignedUserId ?? null),
  );

  protected readonly creatorName = computed(() => {
    const createdBy = this.task()?.createdByUserId;
    return createdBy === null || createdBy === undefined
      ? 'Bilinmiyor'
      : this.users.displayName(createdBy);
  });

  protected readonly canClaim = computed(() => this.task()?.status === TaskItemStatus.Open);

  /** Ekipte tanımlı bütün etiketler - seçici bunları listeliyor. */
  protected readonly allLabels = this.labelStore.labels;

  /** Bu işe takılı etiketler. */
  protected readonly labels = computed(() => this.labelStore.resolve(this.task()?.labelIds ?? []));

  protected readonly labelColors = LABEL_COLORS;
  protected readonly newLabelColor = signal<LabelColor>(DEFAULT_LABEL_COLOR);
  protected readonly savingLabels = signal(false);

  protected readonly newLabelForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(40)]],
  });

  constructor() {
    // Rota parametresi değişince (aynı bileşen farklı işe bağlanınca)
    // her şey baştan yükleniyor.
    //
    // Yüklemeler untracked: loadTask içeride store'u okuyor ve bu okuma
    // izlenseydi effect, listedeki herhangi bir iş her değiştiğinde yeniden
    // çalışır, yorumları ve geçmişi boş yere tekrar çekerdi. Tek bağımlılık
    // rota parametresi olmalı.
    effect(() => {
      const taskId = this.id();
      if (Number.isNaN(taskId)) return;

      untracked(() => {
        this.loadTask(taskId);
        this.loadComments(taskId);
        this.loadChecklist(taskId);
        this.loadAttachments(taskId);
        this.loadActivity(taskId);
      });
    });

    const subscription = this.realtime.events$.subscribe((event) => {
      switch (event.type) {
        case 'comment':
          if (event.comment.taskId === this.id()) this.upsertComment(event.comment);
          break;

        case 'comment-deleted':
          if (event.taskId === this.id()) this.dropComment(event.commentId);
          break;

        case 'checklist':
          if (event.taskId === this.id()) this.checklist.set(event.items);
          break;

        case 'activity':
          if (event.entry.taskId === this.id()) {
            this.activity.update((current) =>
              current.some((entry) => entry.id === event.entry.id)
                ? current
                : [event.entry, ...current],
            );
          }
          break;

        default:
          break;
      }
    });

    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  // --- Yükleme -------------------------------------------------------------

  private loadTask(taskId: number): void {
    // Store'da zaten varsa ağa gitmeye gerek yok.
    if (this.storeTask() !== undefined) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.notFound.set(false);

    this.api.getById(taskId).subscribe({
      next: (task) => {
        this.fetched.set(task);
        this.notFound.set(task === null);
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  private loadComments(taskId: number): void {
    this.api.getComments(taskId).subscribe({
      next: (comments) => this.comments.set(comments),
      error: () => this.comments.set([]),
    });
  }

  private loadChecklist(taskId: number): void {
    this.api.getChecklist(taskId).subscribe({
      next: (items) => this.checklist.set(items),
      error: () => this.checklist.set([]),
    });
  }

  private loadAttachments(taskId: number): void {
    this.api.getAttachments(taskId).subscribe({
      next: (items) => this.attachments.set(items),
      error: () => this.attachments.set([]),
    });
  }

  private loadActivity(taskId: number): void {
    this.activityApi.getForTask(taskId).subscribe({
      next: (entries) => this.activity.set(entries),
      error: () => this.activity.set([]),
    });
  }

  // --- Yorumlar ------------------------------------------------------------

  protected post(): void {
    if (this.posting()) return;

    if (this.commentForm.invalid) {
      this.commentForm.markAllAsTouched();
      return;
    }

    const body = this.commentForm.controls.body.value.trim();
    if (body.length === 0) return;

    this.posting.set(true);

    this.api.addComment(this.id(), body).subscribe({
      next: (comment) => {
        // SignalR aynı yorumu tekrar gönderebilir; upsert olduğu için sorun değil.
        if (comment !== null) this.upsertComment(comment);
        this.commentForm.reset();
        this.posting.set(false);
      },
      error: (error: unknown) => {
        this.posting.set(false);
        this.notify.error(extractErrorMessage(error, 'Yorum eklenemedi.'));
      },
    });
  }

  protected startEdit(comment: TaskComment): void {
    this.editingId.set(comment.id);
    this.editForm.controls.body.setValue(comment.body);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected saveEdit(comment: TaskComment): void {
    const body = this.editForm.controls.body.value.trim();

    if (body.length === 0 || this.editForm.invalid) return;

    if (body === comment.body) {
      this.editingId.set(null);
      return;
    }

    this.busyCommentId.set(comment.id);

    this.api.editComment(this.id(), comment.id, body).subscribe({
      next: (updated) => {
        if (updated !== null) this.upsertComment(updated);
        this.editingId.set(null);
        this.busyCommentId.set(null);
      },
      error: (error: unknown) => {
        this.busyCommentId.set(null);
        this.notify.error(extractErrorMessage(error, this.i18n.t('detail.comments.editFailed')));
      },
    });
  }

  protected async removeComment(comment: TaskComment): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('detail.comments.deleteTitle'),
      message: this.i18n.t('detail.comments.deleteMessage'),
      subject: comment.body,
      confirmLabel: this.i18n.t('common.delete'),
      tone: 'danger',
      icon: 'trash',
    });

    if (!confirmed) return;

    this.busyCommentId.set(comment.id);

    this.api.deleteComment(this.id(), comment.id).subscribe({
      next: () => {
        this.dropComment(comment.id);
        this.busyCommentId.set(null);
      },
      error: (error: unknown) => {
        this.busyCommentId.set(null);
        this.notify.error(extractErrorMessage(error, 'Yorum silinemedi.'));
      },
    });
  }

  // --- Dosya ekleri --------------------------------------------------------

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    // Aynı dosya art arda seçilebilsin diye alan hemen temizleniyor:
    // aksi halde ikinci seçimde "change" olayı hiç tetiklenmiyor.
    input.value = '';

    if (file === undefined || this.uploading()) return;

    this.uploading.set(true);

    this.api.uploadAttachment(this.id(), file).subscribe({
      next: (attachment) => {
        if (attachment !== null) {
          this.attachments.update((current) => [...current, attachment]);
        }
        this.uploading.set(false);
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.notify.error(extractErrorMessage(error, this.i18n.t('detail.files.uploadFailed')));
      },
    });
  }

  protected download(attachment: TaskAttachment): void {
    this.busyAttachmentId.set(attachment.id);

    this.api.downloadAttachment(this.id(), attachment.id).subscribe({
      next: (blob) => {
        this.busyAttachmentId.set(null);
        saveBlob(blob, attachment.fileName);
      },
      error: (error: unknown) => {
        this.busyAttachmentId.set(null);
        this.notify.error(extractErrorMessage(error, 'Dosya indirilemedi.'));
      },
    });
  }

  protected async removeAttachment(attachment: TaskAttachment): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('detail.files.deleteTitle'),
      message: this.i18n.t('detail.files.deleteMessage'),
      subject: attachment.fileName,
      confirmLabel: this.i18n.t('common.delete'),
      tone: 'danger',
      icon: 'trash',
    });

    if (!confirmed) return;

    this.busyAttachmentId.set(attachment.id);

    this.api.deleteAttachment(this.id(), attachment.id).subscribe({
      next: () => {
        this.attachments.update((current) => current.filter((item) => item.id !== attachment.id));
        this.busyAttachmentId.set(null);
      },
      error: (error: unknown) => {
        this.busyAttachmentId.set(null);
        this.notify.error(extractErrorMessage(error, 'Dosya silinemedi.'));
      },
    });
  }

  protected canRemoveAttachment(attachment: TaskAttachment): boolean {
    return attachment.uploadedByUserId === this.auth.userId() || this.auth.isOwner();
  }

  protected fileSize(bytes: number): string {
    return formatFileSize(bytes);
  }

  // --- Etiketler -----------------------------------------------------------

  protected hasLabel(labelId: number): boolean {
    return this.task()?.labelIds.includes(labelId) === true;
  }

  /** Etiketi takar ya da çıkarır; sunucuya her zaman son liste gönderiliyor. */
  protected toggleLabel(labelId: number): void {
    const task = this.task();
    if (task === null || this.savingLabels()) return;

    const next = this.hasLabel(labelId)
      ? task.labelIds.filter((id) => id !== labelId)
      : [...task.labelIds, labelId];

    this.savingLabels.set(true);

    this.api.setLabels(task.id, next).subscribe({
      next: (updated) => {
        // Store canlı kaynak; oradaki kaydı da tazeliyoruz ki pano ve bu
        // sayfa aynı şeyi göstersin.
        if (updated !== null) this.store.replace(updated);
        this.savingLabels.set(false);
      },
      error: (error: unknown) => {
        this.savingLabels.set(false);
        this.notify.error(extractErrorMessage(error, this.i18n.t('detail.labels.updateFailed')));
      },
    });
  }

  protected createLabel(): void {
    if (this.newLabelForm.invalid || this.savingLabels()) return;

    const name = this.newLabelForm.controls.name.value.trim();
    if (name.length === 0) return;

    this.savingLabels.set(true);

    this.labelStore.create({ name, color: this.newLabelColor() }).subscribe({
      next: (labels) => {
        this.savingLabels.set(false);
        this.newLabelForm.reset();
        this.newLabelColor.set(DEFAULT_LABEL_COLOR);

        // Yeni etiket büyük ihtimalle bu iş için oluşturuldu; kullanıcıyı
        // bir de listeden işaretlemeye zorlamıyoruz.
        const created = labels.find((label) => label.name === name);
        if (created !== undefined) this.toggleLabel(created.id);
      },
      error: (error: unknown) => {
        this.savingLabels.set(false);
        this.notify.error(extractErrorMessage(error, this.i18n.t('detail.labels.createFailed')));
      },
    });
  }

  protected async deleteLabel(label: Label): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('detail.labels.deleteTitle'),
      message:
        label.usageCount > 0
          ? this.i18n.t('detail.labels.deleteUsed', { count: label.usageCount })
          : this.i18n.t('detail.labels.deleteUnused'),
      subject: label.name,
      confirmLabel: this.i18n.t('common.delete'),
      tone: 'danger',
      icon: 'trash',
    });

    if (!confirmed) return;

    this.labelStore.remove(label.id).subscribe({
      next: () => {
        // Etiket birden fazla işten kalkmış olabilir; store'daki kayıtların
        // hepsi bayat. loadTask burada işe yaramazdı: store'da kayıt varsa
        // erken dönüp ağa hiç gitmiyor.
        this.store.reload();
      },
      error: (error: unknown) =>
        this.notify.error(extractErrorMessage(error, 'Etiket silinemedi.')),
    });
  }

  protected pickColor(color: LabelColor): void {
    this.newLabelColor.set(color);
  }

  // --- Kontrol listesi -----------------------------------------------------

  protected addItem(): void {
    if (this.addingItem() || this.newItemForm.invalid) return;

    const title = this.newItemForm.controls.title.value.trim();
    if (title.length === 0) return;

    this.addingItem.set(true);

    this.api.addChecklistItem(this.id(), title).subscribe({
      next: (items) => {
        this.checklist.set(items);
        this.newItemForm.reset();
        this.addingItem.set(false);
      },
      error: (error: unknown) => {
        this.addingItem.set(false);
        this.notify.error(extractErrorMessage(error, this.i18n.t('detail.checklist.addFailed')));
      },
    });
  }

  protected toggleItem(item: ChecklistItem): void {
    // İyimser güncelleme: onay kutusu tıklanır tıklanmaz dönmeli, sunucu
    // cevabını beklemek tik atmayı ağır hissettirirdi.
    const snapshot = this.checklist();

    this.checklist.update((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, isDone: !entry.isDone } : entry)),
    );

    this.api.updateChecklistItem(this.id(), item.id, item.title, !item.isDone).subscribe({
      next: (items) => this.checklist.set(items),
      error: (error: unknown) => {
        this.checklist.set(snapshot);
        this.notify.error(extractErrorMessage(error, this.i18n.t('detail.checklist.updateFailed')));
      },
    });
  }

  protected startItemEdit(item: ChecklistItem): void {
    this.editingItemId.set(item.id);
    this.itemEditForm.controls.title.setValue(item.title);
  }

  protected cancelItemEdit(): void {
    this.editingItemId.set(null);
  }

  protected saveItemEdit(item: ChecklistItem): void {
    const title = this.itemEditForm.controls.title.value.trim();

    if (title.length === 0 || this.itemEditForm.invalid) return;

    if (title === item.title) {
      this.editingItemId.set(null);
      return;
    }

    this.api.updateChecklistItem(this.id(), item.id, title, item.isDone).subscribe({
      next: (items) => {
        this.checklist.set(items);
        this.editingItemId.set(null);
      },
      error: (error: unknown) =>
        this.notify.error(extractErrorMessage(error, this.i18n.t('detail.checklist.updateFailed'))),
    });
  }

  protected removeItem(item: ChecklistItem): void {
    const snapshot = this.checklist();

    this.checklist.update((current) => current.filter((entry) => entry.id !== item.id));

    this.api.deleteChecklistItem(this.id(), item.id).subscribe({
      error: (error: unknown) => {
        this.checklist.set(snapshot);
        this.notify.error(extractErrorMessage(error, this.i18n.t('detail.checklist.deleteFailed')));
      },
    });
  }

  protected dropItem(event: CdkDragDrop<ChecklistItem[]>): void {
    if (event.previousIndex === event.currentIndex) return;

    const snapshot = this.checklist();
    const reordered = [...snapshot];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);

    // Sıra hemen uygulanıyor; sunucu reddederse eski hâle dönülüyor.
    this.checklist.set(reordered);

    this.api
      .reorderChecklist(
        this.id(),
        reordered.map((item) => item.id),
      )
      .subscribe({
        next: (items) => this.checklist.set(items),
        error: (error: unknown) => {
          this.checklist.set(snapshot);
          this.notify.error(extractErrorMessage(error, this.i18n.t('detail.checklist.orderFailed')));
        },
      });
  }

  // --- İş aksiyonları ------------------------------------------------------

  protected claim(): void {
    const task = this.task();
    if (task !== null) void this.actions.claim(task);
  }

  protected complete(): void {
    const task = this.task();
    if (task !== null) void this.actions.moveTo(task, TaskItemStatus.Completed);
  }

  protected edit(): void {
    const task = this.task();
    if (task !== null) this.actions.openEditDialog(task);
  }

  // --- Görünüm yardımcıları ------------------------------------------------

  protected setTab(tab: DetailTab): void {
    this.tab.set(tab);
  }

  protected isMine(comment: TaskComment): boolean {
    return comment.authorUserId === this.auth.userId();
  }

  protected authorLabel(comment: TaskComment): string {
    if (this.isMine(comment)) return 'Sen';
    return comment.authorName ?? this.i18n.t('activity.unknownUser');
  }

  protected relative(isoDate: string): string {
    return formatRelative(isoDate);
  }

  protected fullDate(isoDate: string): string {
    return formatFullDate(isoDate);
  }

  /** Yorumu id'ye göre yerine koyar; yoksa sona ekler. */
  private upsertComment(comment: TaskComment): void {
    this.comments.update((current) => {
      const index = current.findIndex((item) => item.id === comment.id);
      if (index === -1) return [...current, comment];

      const next = [...current];
      next[index] = comment;
      return next;
    });
  }

  private dropComment(commentId: number): void {
    this.comments.update((current) => current.filter((comment) => comment.id !== commentId));
  }
}

/**
 * Blob'u kullanıcıya indirtir.
 *
 * Geçici bir nesne adresi üretiliyor; serbest bırakılmazsa sekme kapanana
 * kadar bellekte kalır.
 */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}

/** 1536 -> "1,5 KB". Bin değil 1024 tabanı; dosya boyutları böyle okunuyor. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toLocaleString('tr', { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
}
