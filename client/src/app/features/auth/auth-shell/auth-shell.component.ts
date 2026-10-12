import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { I18nService } from '../../../core/i18n/i18n.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { LanguagePickerComponent } from '../../../shared/ui/language-picker/language-picker.component';
import { ThemeToggleComponent } from '../../../shared/ui/theme-toggle/theme-toggle.component';
import { LogoComponent } from '../../../shared/ui/logo/logo.component';

/**
 * Giriş ve kayıt ekranlarının ortak çerçevesi.
 *
 * Solda form (içerik projeksiyonu ile geliyor), sağda ürünü kısaca anlatan
 * sabit bir panel. Panel dar ekranlarda gizleniyor.
 */
@Component({
  selector: 'app-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LanguagePickerComponent, ThemeToggleComponent, IconComponent, LogoComponent],
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.scss',
})
export class AuthShellComponent {
  protected readonly year = new Date().getFullYear();
  protected readonly i18n = inject(I18nService);
}
