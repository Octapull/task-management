import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

import { RealtimeService } from '../../../core/services/realtime.service';
import { formatFullDate } from '../../../shared/util/date';
import { I18nService } from '../../../core/i18n/i18n.service';

/**
 * SignalR bağlantı durumu göstergesi.
 *
 * Bağlantı kopmuşsa üzerine tıklayarak yeniden bağlanmayı deniyor - bu yüzden
 * bir <button>; sadece dekoratif bir nokta değil.
 */
@Component({
  selector: 'app-connection-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTooltipModule],
  template: `
    <button
      type="button"
      class="conn"
      [class]="'conn--' + status()"
      [matTooltip]="tooltip()"
      matTooltipPosition="below"
      (click)="reconnect()"
    >
      <span class="conn__dot" aria-hidden="true"></span>
      <span class="conn__label">{{ label() }}</span>
    </button>
  `,
  styles: `
    .conn {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
      height: var(--control-h-sm);
      padding: 0 var(--sp-2);
      border: var(--border-width) solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-surface);
      color: var(--fg-muted);
      font-size: var(--fs-12);
      font-weight: var(--fw-medium);
      cursor: pointer;
      transition: background-color var(--dur-fast) var(--ease-standard);
    }

    .conn:hover {
      background: var(--bg-hover);
    }

    .conn__dot {
      width: 6px;
      height: 6px;
      border-radius: var(--radius-pill);
      background: var(--fg-subtle);
      flex: none;
    }

    .conn--connected .conn__dot {
      background: var(--success-fg);
    }

    .conn--connecting .conn__dot,
    .conn--reconnecting .conn__dot {
      background: var(--warning-fg);
      animation: pulse 1.1s var(--ease-standard) infinite;
    }

    .conn--disconnected .conn__dot {
      background: var(--danger-fg);
    }

    /* Dar ekranda sadece nokta kalsın. */
    @media (max-width: 860px) {
      .conn__label {
        display: none;
      }
    }

    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.35;
      }
    }
  `,
})
export class ConnectionIndicatorComponent {
  private readonly realtime = inject(RealtimeService);
  private readonly i18n = inject(I18nService);

  protected readonly status = this.realtime.status;

  protected readonly label = computed(() => {
    switch (this.status()) {
      case 'connected':
        return this.i18n.t('connection.live');
      case 'connecting':
        return this.i18n.t('connection.connecting');
      case 'reconnecting':
        return this.i18n.t('connection.reconnecting');
      default:
        return this.i18n.t('connection.offline');
    }
  });

  protected readonly tooltip = computed(() => {
    if (this.status() !== 'connected') {
      return this.i18n.t('connection.offlineTooltip');
    }

    const last = this.realtime.lastEventAt();
    return last === null
      ? this.i18n.t('connection.liveTooltip')
      : this.i18n.t('connection.liveTooltipAt', {
          when: formatFullDate(last.toISOString()),
        });
  });

  protected reconnect(): void {
    void this.realtime.reconnect();
  }
}
