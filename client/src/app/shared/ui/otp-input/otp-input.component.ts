import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, model, output, signal, viewChildren } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';

/**
 * 6 haneli doğrulama kodu girişi.
 *
 * Tek bir input yerine kutu kutu gösteriliyor çünkü kullanıcı kodu e-postadan
 * okuyarak yazıyor; haneleri ayrı görmek yazarken de kontrol ederken de
 * daha kolay.
 *
 * Haneler içeride bir dizide (`digits`) konumlarıyla duruyor; dışarı verilen
 * `value` ise bunların birleşimi. Ayrım önemli: kullanıcı ortadaki bir haneyi
 * silerse kutu boş kalmalı, sağdakiler sola kaymamalı.
 */
@Component({
  selector: 'app-otp-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="otp" role="group" [attr.aria-label]="i18n.t('otp.aria', { length: length() })">
      @for (digit of digits(); track $index) {
        <input
          #box
          class="otp__box"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="1"
          [value]="digit"
          [disabled]="disabled()"
          [class.otp__box--filled]="digit !== ''"
          [class.otp__box--invalid]="invalid()"
          [attr.aria-label]="$index + 1 + '. hane'"
          [attr.aria-invalid]="invalid()"
          (input)="onInput($event, $index)"
          (keydown)="onKeydown($event, $index)"
          (paste)="onPaste($event)"
          (focus)="onFocus($event)"
        />
      }
    </div>
  `,
  styles: `
    .otp {
      display: flex;
      gap: var(--sp-2);
    }

    .otp__box {
      /* Kutular kalan genişliği eşit paylaşsın: dar ekranda da taşmıyor. */
      flex: 1;
      min-width: 0;
      height: 52px;
      padding: 0;
      border: var(--border-width) solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--bg-surface);
      color: var(--fg-default);
      font-size: var(--fs-22);
      font-weight: var(--fw-semibold);
      font-variant-numeric: tabular-nums;
      text-align: center;
      transition:
        border-color var(--dur-fast) var(--ease-standard),
        box-shadow var(--dur-fast) var(--ease-standard),
        background-color var(--dur-fast) var(--ease-standard);
    }

    /* Dolu kutu, boş olandan hafifçe ayrışsın - ilerleme görünür olsun. */
    .otp__box--filled {
      border-color: var(--fg-subtle);
      background: var(--bg-inset);
    }

    .otp__box:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
      background: var(--bg-surface);
    }

    .otp__box--invalid {
      border-color: var(--danger-fg);
    }

    .otp__box--invalid:focus {
      box-shadow: 0 0 0 1px var(--danger-fg);
    }

    .otp__box:disabled {
      background: var(--bg-inset);
      color: var(--fg-subtle);
      cursor: not-allowed;
    }
  `,
})
export class OtpInputComponent {
  protected readonly i18n = inject(I18nService);
  readonly length = input(6);
  readonly disabled = input(false);
  readonly invalid = input(false);

  /**
   * Girilen kod. Yalnızca dolu haneleri içerir; bütün kutular dolduğunda
   * uzunluğu `length()` kadar olur.
   */
  readonly value = model('');

  /** Son hane de dolduğunda bir kez yayılır - formu otomatik göndermek için. */
  readonly completed = output<string>();

  /** Hane hane durum. Boş kutu '' olarak duruyor, konumu korunuyor. */
  protected readonly digits = signal<string[]>([]);

  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');

  /** Kutuların tamamı dolu mu? */
  private readonly isComplete = computed(() => this.digits().every((digit) => digit !== ''));

  constructor() {
    // Dışarıdan gelen değeri (ilk değer, programatik temizleme) kutulara
    // dağıtıyoruz. Kullanıcı yazarken bu effect kendi yazdığımız değeri
    // görüyor ve aynı diziyi yeniden kurmuş oluyor - sonuç değişmediği
    // için döngüye girmiyor. Uzunluk kontrolü şart: ilk çalıştırmada digits
    // henüz boş dizi oluyor ve '' === '' eşleşmesi kutuların hiç
    // kurulmamasına yol açıyor.
    effect(() => {
      const incoming = this.value();
      const size = this.length();

      if (this.digits().length === size && incoming === this.digits().join('')) return;

      const next = Array.from({ length: size }, (_, i) => incoming[i] ?? '');
      this.digits.set(next);
    });
  }

  protected onInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;

    // Rakam dışındaki her şey atılıyor. Kullanıcı dolu bir kutunun üstüne
    // yazdığında tarayıcı iki karakter gönderebiliyor; son gireni alıyoruz.
    const digit = input.value.replace(/\D/g, '').at(-1) ?? '';

    // Kutunun DOM değerini elle geri yazıyoruz: geçersiz karakter girildiğinde
    // signal değişmiyor, dolayısıyla Angular kutuyu kendiliğinden temizlemiyor.
    input.value = digit;

    this.writeAt(index, digit);

    if (digit !== '') this.focusBox(index + 1);
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    switch (event.key) {
      case 'Backspace': {
        // Kutu zaten boşsa geri gidip önceki haneyi siliyoruz: kullanıcı
        // iki kez Backspace'e basmak zorunda kalmasın.
        if (this.digits()[index] === '') {
          event.preventDefault();
          this.writeAt(index - 1, '');
          this.focusBox(index - 1);
        } else {
          this.writeAt(index, '');
        }
        break;
      }

      case 'ArrowLeft':
        event.preventDefault();
        this.focusBox(index - 1);
        break;

      case 'ArrowRight':
        event.preventDefault();
        this.focusBox(index + 1);
        break;

      default:
        break;
    }
  }

  /**
   * Kodun tamamı tek seferde yapıştırılabiliyor - e-postadan kopyalayan
   * kullanıcı haneleri tek tek dağıtmak zorunda kalmasın.
   */
  protected onPaste(event: ClipboardEvent): void {
    event.preventDefault();

    const size = this.length();
    const pasted = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, size);

    if (pasted === '') return;

    this.digits.set(Array.from({ length: size }, (_, i) => pasted[i] ?? ''));
    this.publish();

    // İmleç, yapıştırılan kodun bittiği yere gitsin.
    this.focusBox(Math.min(pasted.length, size - 1));
  }

  /** Kutuya tıklandığında içerik seçili gelsin - üstüne yazmak kolaylaşsın. */
  protected onFocus(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }

  /** Dışarıdan çağrılıyor: hatalı koddan sonra alanı temizleyip odaklamak için. */
  reset(): void {
    this.digits.set(Array.from({ length: this.length() }, () => ''));
    this.publish();
    this.focusBox(0);
  }

  /** İlk boş kutuya odaklanır; ekran açılırken kullanılıyor. */
  focusFirstEmpty(): void {
    const emptyIndex = this.digits().findIndex((digit) => digit === '');
    this.focusBox(emptyIndex === -1 ? this.length() - 1 : emptyIndex);
  }

  private writeAt(index: number, digit: string): void {
    if (index < 0 || index >= this.length()) return;

    this.digits.update((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });

    this.publish();
  }

  /** Hane dizisini dışarıya tek bir metin olarak yansıtır. */
  private publish(): void {
    const wasComplete = this.value().length === this.length();

    this.value.set(this.digits().join(''));

    // Yalnızca "az önce tamamlandı" anında yayınlıyoruz; dolu bir kutunun
    // üstüne yazmak her seferinde yeniden gönderim tetiklemesin.
    if (this.isComplete() && !wasComplete) {
      this.completed.emit(this.value());
    }
  }

  private focusBox(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.length() - 1));
    this.boxes().at(clamped)?.nativeElement.focus();
  }
}
