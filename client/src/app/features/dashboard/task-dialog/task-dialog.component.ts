import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { TASK_PRIORITY_KEYS, TaskItem, TaskPriority } from '../../../core/models/task.model';
import { TaskStore } from '../../../core/services/task.store';
import { UserDirectoryService } from '../../../core/services/user-directory.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { fromDateInputValue, toDateInputValue } from '../../../shared/util/date';
import { Translate, criticalUpdateConfirm, isCriticalUpdate } from '../task-confirm';
import { I18nService } from '../../../core/i18n/i18n.service';

export interface TaskDialogData {
  /** Dolu gelirse pencere düzenleme modunda açılır. */
  task?: TaskItem;
}

/**
 * İş oluşturma / düzenleme penceresi.
 *
 * Durum ve atama burada değiştirilmiyor; onlar panodaki sürükle-bırak ve kart
 * menüsü üzerinden yönetiliyor (backend'de de ayrı uç noktalar).
 */
@Component({
  selector: 'app-task-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatDialogModule, IconComponent],
  templateUrl: './task-dialog.component.html',
  styleUrl: './task-dialog.component.scss',
})
export class TaskDialogComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly store = inject(TaskStore);
  private readonly confirm = inject(ConfirmService);
  private readonly users = inject(UserDirectoryService);
  protected readonly i18n = inject(I18nService);

  private readonly t: Translate = (key, params) => this.i18n.t(key, params);
  private readonly dialogRef = inject<MatDialogRef<TaskDialogComponent, boolean>>(MatDialogRef);

  private readonly data = inject<TaskDialogData | null>(MAT_DIALOG_DATA, {
    optional: true,
  });

  protected readonly editingTask = this.data?.task ?? null;

  protected readonly submitting = signal(false);

  protected readonly priorities = [TaskPriority.Low, TaskPriority.Medium, TaskPriority.High];

  protected priorityLabel(priority: TaskPriority): string {
    return this.i18n.t(TASK_PRIORITY_KEYS[priority]);
  }

  protected readonly form = this.formBuilder.nonNullable.group({
    title: [this.editingTask?.title ?? '', [Validators.required, Validators.maxLength(200)]],
    description: [this.editingTask?.description ?? '', [Validators.maxLength(2000)]],
    priority: [this.editingTask?.priority ?? TaskPriority.Medium],
    dueDate: [toDateInputValue(this.editingTask?.dueDate ?? null)],
  });

  protected async submit(): Promise<void> {
    if (this.submitting()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Kritik güncellemede önce onay isteniyor: başkasının üzerindeki ya da
    // tamamlanmış bir işi değiştirmek başka birinin gördüğü işi de etkiliyor.
    const task = this.editingTask;

    if (task !== null && !(await this.confirmUpdate(task))) return;

    this.submitting.set(true);

    const value = this.form.getRawValue();
    const request = {
      title: value.title.trim(),
      description: value.description.trim(),
      priority: value.priority,
      dueDate: fromDateInputValue(value.dueDate),
    };

    const saved = task
      ? await this.store.update(task.id, request)
      : await this.store.create(request);

    this.submitting.set(false);

    if (saved) this.dialogRef.close(true);
  }

  /** Kritik sayılan düzenlemede onay ister; sıradan düzenlemede sormaz. */
  private confirmUpdate(task: TaskItem): Promise<boolean> {
    const assignedToSomeoneElse =
      task.assignedUserId !== null && !this.users.isMe(task.assignedUserId);

    if (!isCriticalUpdate(task, assignedToSomeoneElse)) {
      return Promise.resolve(true);
    }

    return this.confirm.ask(
      criticalUpdateConfirm(this.t, task, this.users.displayName(task.assignedUserId)),
    );
  }

  protected setPriority(priority: TaskPriority): void {
    this.form.controls.priority.setValue(priority);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }

  protected get titleInvalid(): boolean {
    const control = this.form.controls.title;
    return control.invalid && control.touched;
  }
}
