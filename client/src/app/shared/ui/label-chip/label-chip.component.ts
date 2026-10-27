import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Label } from '../../../core/models/label.model';

/**
 * Etiket rozeti.
 *
 * Ayrı bileşen çünkü aynı çip hem kartta, hem detay sayfasında, hem de etiket
 * seçicisinde görünüyor - renk tanımlarının üç yerde tekrarlanması hem
 * kalabalık hem de kaçınılmaz olarak birbirinden ayrışırdı.
 *
 * Renkler doğrudan kod olarak değil, sabit bir isim listesinden geliyor
 * (bkz. `label.model.ts`): koyu temada okunmayan bir renk seçilemesin.
 */
@Component({
  selector: 'app-label-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip chip--{{ label().color }}" [class.chip--sm]="small()">
      <span class="chip__dot" aria-hidden="true"></span>
      <span class="chip__name">{{ label().name }}</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      min-width: 0;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
      min-width: 0;
      padding: 2px var(--sp-3);
      border: var(--border-width) solid var(--chip-border);
      border-radius: var(--radius-pill);
      background: var(--chip-bg);
      font-size: var(--fs-12);
      font-weight: var(--fw-medium);
      color: var(--chip-fg);
    }

    /* Kartta yer dar: daha küçük ve noktasız. */
    .chip--sm {
      gap: var(--sp-1);
      padding: 1px var(--sp-2);
      font-size: var(--fs-11);
    }

    .chip__dot {
      width: 6px;
      height: 6px;
      flex: none;
      border-radius: var(--radius-pill);
      background: var(--chip-fg);
    }

    /* Uzun etiket adı satırı taşırmasın. */
    .chip__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Ton başına yalnızca üç değişken; kuralların kendisi ortak. */
    .chip--gray {
      --chip-bg: var(--bg-inset);
      --chip-border: var(--border);
      --chip-fg: var(--fg-muted);
    }

    .chip--blue {
      --chip-bg: var(--info-bg);
      --chip-border: var(--info-border);
      --chip-fg: var(--info-fg);
    }

    .chip--green {
      --chip-bg: var(--success-bg);
      --chip-border: var(--success-border);
      --chip-fg: var(--success-fg);
    }

    .chip--yellow {
      --chip-bg: var(--warning-bg);
      --chip-border: var(--warning-border);
      --chip-fg: var(--warning-fg);
    }

    .chip--orange {
      --chip-bg: var(--accent-subtle);
      --chip-border: var(--accent-border);
      --chip-fg: var(--accent-text);
    }

    .chip--red {
      --chip-bg: var(--danger-bg);
      --chip-border: var(--danger-border);
      --chip-fg: var(--danger-fg);
    }

    /* Mor ve turkuaz için hazır token yok; renkleri iki temada da okunur
       kalacak şekilde color-mix ile yüzeyden türetiyoruz. */
    .chip--purple {
      --chip-fg: light-dark(#7c3aed, #c4b5fd);
      --chip-bg: color-mix(in srgb, var(--chip-fg) 12%, var(--bg-surface));
      --chip-border: color-mix(in srgb, var(--chip-fg) 30%, var(--bg-surface));
    }

    .chip--teal {
      --chip-fg: light-dark(#0d9488, #5eead4);
      --chip-bg: color-mix(in srgb, var(--chip-fg) 12%, var(--bg-surface));
      --chip-border: color-mix(in srgb, var(--chip-fg) 30%, var(--bg-surface));
    }
  `,
})
export class LabelChipComponent {
  readonly label = input.required<Label>();

  /** Kartta kullanılan sıkışık biçim. */
  readonly small = input(false);
}
