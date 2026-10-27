import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { ICON_PATHS, IconName } from './icon.constants';

/**
 * Tek satırlık ikon bileşeni: `<app-icon name="search" [size]="14" />`
 *
 * Güvenlik notu: innerHTML'e verilen içerik ICON_PATHS sabitinden geliyor,
 * kullanıcı girdisi buraya asla ulaşmıyor (name input'u IconName birleşim
 * tipiyle sınırlı). Bu yüzden bypassSecurityTrustHtml kullanımı güvenli.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      [innerHTML]="markup()"
      aria-hidden="true"
      focusable="false"
    ></svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      /* Metinle aynı satırda dururken optik olarak ortalanması için. */
      vertical-align: middle;
    }
  `,
})
export class IconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<IconName>();
  readonly size = input(16);

  /** Küçük boyutlarda 2px çok kalın kalıyor; varsayılanı 1.75'e çektik. */
  readonly strokeWidth = input(1.75);

  protected readonly markup = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(ICON_PATHS[this.name()]),
  );
}
