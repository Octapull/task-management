import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

import { I18nService } from '../../../core/i18n/i18n.service';
import { ThemeService } from '../../../core/services/theme.service';
import { IconComponent } from '../icon/icon.component';

/**
 * Açık/koyu tema düğmesi.
 *
 * Hem panonun üst çubuğunda hem kimlik ekranlarının başlığında kullanılıyor -
 * kullanıcı temayı giriş yapmadan da seçebilmeli. İki yerde aynı markup'ı
 * tekrarlamamak için ayrı bileşen; ikon ve ipucu metni geçerli temaya göre
 * kendiliğinden dönüyor.
 */
@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTooltipModule, IconComponent],
  template: `
    <button
      type="button"
      class="btn btn--ghost btn--icon"
      (click)="toggle()"
      [matTooltip]="isDark() ? i18n.t('theme.toLight') : i18n.t('theme.toDark')"
      [attr.aria-label]="isDark() ? i18n.t('theme.toLight') : i18n.t('theme.toDark')"
    >
      <app-icon [name]="isDark() ? 'sun' : 'moon'" [size]="15" />
    </button>
  `,
})
export class ThemeToggleComponent {
  protected readonly i18n = inject(I18nService);

  private readonly theme = inject(ThemeService);

  protected readonly isDark = computed(() => this.theme.theme() === 'dark');

  protected toggle(): void {
    this.theme.toggle();
  }
}
