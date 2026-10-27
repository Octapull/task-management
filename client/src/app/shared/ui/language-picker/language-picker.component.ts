import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

import { I18nService } from '../../../core/i18n/i18n.service';
import { LOCALES, Locale } from '../../../core/i18n/locale';
import { IconComponent } from '../icon/icon.component';

/**
 * Dil seçici.
 *
 * Üst çubukta tema düğmesinin yanında duruyor; giriş yapmadan da görünsün
 * diye kimlik ekranlarının kabuğunda da kullanılıyor - kullanıcı arayüzü
 * anlamadığı bir dilde açıldıysa önce dili değiştirebilmeli.
 *
 * Seçenek etiketleri çevrilmiyor, her dil kendi adıyla yazılıyor (bkz.
 * `locale.ts`).
 */
@Component({
  selector: 'app-language-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatMenuModule, MatTooltipModule, IconComponent],
  template: `
    <button
      type="button"
      class="btn btn--ghost btn--icon"
      [matMenuTriggerFor]="languageMenu"
      [matTooltip]="i18n.t('language.menu')"
      [attr.aria-label]="i18n.t('language.menu')"
    >
      <app-icon name="globe" [size]="15" />
    </button>

    <mat-menu #languageMenu="matMenu" xPosition="before">
      @for (option of locales; track option.code) {
        <button
          mat-menu-item
          type="button"
          [attr.aria-current]="i18n.locale() === option.code"
          (click)="select(option.code)"
        >
          <span class="lang__flag" aria-hidden="true">{{ option.flag }}</span>
          <span class="lang__label">{{ option.label }}</span>
          @if (i18n.locale() === option.code) {
            <app-icon class="lang__check" name="check" [size]="14" />
          }
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .lang__flag {
      margin-right: 0.5rem;
    }

    /* Seçili dilin tiki sağa yaslanıyor, etiketler hizalı kalsın. */
    .lang__check {
      margin-left: auto;
      color: var(--accent);
    }
  `,
})
export class LanguagePickerComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly locales = LOCALES;

  protected select(locale: Locale): void {
    this.i18n.use(locale);
  }
}
