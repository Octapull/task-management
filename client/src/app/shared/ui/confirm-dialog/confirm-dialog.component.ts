import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';

import { IconComponent } from '../icon/icon.component';
import { IconName } from '../icon/icon.constants';
import { I18nService } from '../../../core/i18n/i18n.service';

/**
 * Pencerenin rengi. İşlemin ağırlığını metnin yanında renkle de anlatıyor:
 * geri alınamayan silme kırmızı, tamamlama yeşil, havuza döndürme sarı.
 */
export type ConfirmTone = 'neutral' | 'accent' | 'danger' | 'warning' | 'success';

export interface ConfirmDialogData {
  title: string;
  message: string;

  /**
   * İşlemin uygulanacağı işin başlığı. Ayrı bir satırda vurgulanıyor:
   * kullanıcı yanlış kartı tıkladıysa en hızlı buradan fark ediyor.
   */
  subject?: string;

  /** Tek satırlık değişiklik özeti, ör. "Boşta → Devam ediyor". */
  details?: string;

  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;

  /** Verilmezse tonun varsayılan simgesi kullanılır. */
  icon?: IconName;
}

const TONE_ICONS: Record<ConfirmTone, IconName> = {
  neutral: 'circle-alert',
  accent: 'circle-alert',
  danger: 'triangle-alert',
  warning: 'triangle-alert',
  success: 'circle-check',
};

/**
 * Geri alınması zor işlemler için onay penceresi. `true` (onaylandı) ya da
 * `false` (vazgeçildi / Escape / dışarı tıklama) döner.
 *
 * Pencere hiçbir iş mantığı bilmiyor - yalnızca verilen metni gösterip
 * kullanıcının kararını döndürüyor. Metinler `task-confirm.ts` içinde.
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, IconComponent],
  template: `
    <div class="confirm confirm--{{ tone }}">
      <div class="confirm__head">
        <span class="confirm__icon">
          <app-icon [name]="icon" [size]="16" />
        </span>
        <div class="confirm__text">
          <h2 class="confirm__title">{{ data.title }}</h2>
          <p class="confirm__message">{{ data.message }}</p>
        </div>
      </div>

      @if (data.subject) {
        <p class="confirm__subject" [title]="data.subject">
          <app-icon name="clipboard-list" [size]="13" />
          <span class="confirm__subject-text">{{ data.subject }}</span>
        </p>
      }

      @if (data.details) {
        <p class="confirm__details">{{ data.details }}</p>
      }

      <div class="confirm__actions">
        <button type="button" class="btn" (click)="dialogRef.close(false)">
          {{ data.cancelLabel ?? i18n.t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn"
          [class.btn--danger]="tone === 'danger'"
          [class.btn--primary]="tone !== 'danger'"
          (click)="dialogRef.close(true)"
        >
          {{ data.confirmLabel ?? 'Onayla' }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .confirm {
      padding: var(--sp-5);
    }

    /* Ton başına yalnızca üç değişken değişiyor; kuralların kendisi ortak. */
    .confirm--neutral {
      --confirm-bg: var(--bg-inset);
      --confirm-border: var(--border);
      --confirm-fg: var(--fg-muted);
    }

    .confirm--accent {
      --confirm-bg: var(--accent-subtle);
      --confirm-border: var(--accent-border);
      --confirm-fg: var(--accent-text);
    }

    .confirm--danger {
      --confirm-bg: var(--danger-bg);
      --confirm-border: var(--danger-border);
      --confirm-fg: var(--danger-fg);
    }

    .confirm--warning {
      --confirm-bg: var(--warning-bg);
      --confirm-border: var(--warning-border);
      --confirm-fg: var(--warning-fg);
    }

    .confirm--success {
      --confirm-bg: var(--success-bg);
      --confirm-border: var(--success-border);
      --confirm-fg: var(--success-fg);
    }

    .confirm__head {
      display: flex;
      gap: var(--sp-3);
      margin-bottom: var(--sp-4);
    }

    .confirm__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      flex: none;
      border: var(--border-width) solid var(--confirm-border);
      border-radius: var(--radius-md);
      background: var(--confirm-bg);
      color: var(--confirm-fg);
    }

    .confirm__title {
      font-size: var(--fs-14);
      margin-bottom: var(--sp-1);
    }

    .confirm__message {
      font-size: var(--fs-13);
      line-height: var(--lh-normal);
      color: var(--fg-muted);
    }

    /* İşin başlığı: kullanıcı yanlış kartı seçtiyse buradan fark etsin. */
    .confirm__subject {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      margin-bottom: var(--sp-2);
      padding: var(--sp-2) var(--sp-3);
      border: var(--border-width) solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-inset);
      font-size: var(--fs-13);
      font-weight: var(--fw-medium);
      color: var(--fg-default);
    }

    .confirm__subject app-icon {
      flex: none;
      color: var(--fg-subtle);
    }

    /* Uzun başlık pencereyi büyütmesin, tek satırda kısalsın. */
    .confirm__subject-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .confirm__details {
      margin-bottom: var(--sp-2);
      font-size: var(--fs-12);
      color: var(--fg-subtle);
      font-variant-numeric: tabular-nums;
    }

    .confirm__actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--sp-2);
      margin-top: var(--sp-5);
    }
  `,
})
export class ConfirmDialogComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly dialogRef =
    inject<MatDialogRef<ConfirmDialogComponent, boolean>>(MatDialogRef);

  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

  protected readonly tone: ConfirmTone = this.data.tone ?? 'neutral';

  protected readonly icon: IconName = this.data.icon ?? TONE_ICONS[this.tone];
}
