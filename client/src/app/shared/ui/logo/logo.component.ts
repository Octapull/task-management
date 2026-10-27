import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Ürün işareti + kelime markası. Giriş ekranında ve üst çubukta kullanılıyor. */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="logo">
      <svg
        class="logo__mark"
        [attr.width]="size()"
        [attr.height]="size()"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <rect width="20" height="20" rx="4.5" fill="var(--accent)" />
        <rect x="4.5" y="5" width="2.5" height="10" rx="1.25" fill="#fff" />
        <rect
          x="8.75"
          y="5"
          width="2.5"
          height="7"
          rx="1.25"
          fill="#fff"
          opacity="0.72"
        />
        <rect
          x="13"
          y="5"
          width="2.5"
          height="4"
          rx="1.25"
          fill="#fff"
          opacity="0.48"
        />
      </svg>

      @if (showWordmark()) {
        <span class="logo__text">İş Takip</span>
      }
    </span>
  `,
  styles: `
    .logo {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
      color: var(--fg-default);
    }

    .logo__mark {
      display: block;
      flex: none;
    }

    .logo__text {
      font-size: var(--fs-14);
      font-weight: var(--fw-semibold);
      letter-spacing: var(--tracking-tight);
      white-space: nowrap;
    }
  `,
})
export class LogoComponent {
  readonly size = input(20);
  readonly showWordmark = input(true);
}
