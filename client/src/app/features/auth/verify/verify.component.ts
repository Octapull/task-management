import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { NotifyService } from '../../../core/services/notify.service';
import { extractErrorMessage } from '../../../core/util/http-error';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { OtpInputComponent } from '../../../shared/ui/otp-input/otp-input.component';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';
import { I18nService } from '../../../core/i18n/i18n.service';

const CODE_LENGTH = 6;

/**
 * E-posta doğrulama adımı.
 *
 * Buraya iki yoldan geliniyor: kayıt sonrası ve doğrulanmamış bir hesapla
 * giriş denendiğinde. İkisinde de AuthService'teki "bekleyen doğrulama"
 * kaydı dolu oluyor; guard bu kayıt yoksa sayfayı hiç açmıyor.
 */
@Component({
  selector: 'app-verify',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AuthShellComponent, IconComponent, OtpInputComponent],
  templateUrl: './verify.component.html',
  styleUrl: './verify.component.scss',
})
export class VerifyComponent {
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  private readonly otp = viewChild.required(OtpInputComponent);

  protected readonly pending = this.auth.pendingVerification;

  protected readonly code = signal('');
  protected readonly submitting = signal(false);
  protected readonly resending = signal(false);
  protected readonly formError = signal<string | null>(null);

  /**
   * Saniyede bir ilerleyen "şu an". Geri sayımlar bunun türevi - her sayaç
   * için ayrı zamanlayıcı kurmak yerine tek kaynak kullanıyoruz.
   */
  private readonly now = signal(Date.now());

  /** Kodun geçerliliğine kalan saniye. */
  protected readonly secondsLeft = computed(() =>
    secondsUntil(this.pending()?.expiresAt, this.now()),
  );

  /** "Yeniden gönder" butonunun açılmasına kalan saniye. */
  protected readonly resendIn = computed(() =>
    secondsUntil(this.pending()?.resendAvailableAt, this.now()),
  );

  protected readonly expired = computed(() => this.secondsLeft() === 0);

  protected readonly canResend = computed(
    () => this.resendIn() === 0 && !this.resending(),
  );

  /** mm:ss biçiminde geri sayım. */
  protected readonly countdown = computed(() => {
    const total = this.secondsLeft();
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    destroyRef.onDestroy(() => clearInterval(timer));

    // Sayfa açılır açılmaz ilk kutuya odaklan - kullanıcı doğrudan yazsın.
    afterNextRender(() => this.otp().focusFirstEmpty());
  }

  /** OTP bileşeni son haneyi de aldığında otomatik gönderiyoruz. */
  protected onCompleted(code: string): void {
    this.code.set(code);
    this.submit();
  }

  protected submit(): void {
    if (this.submitting()) return;

    const email = this.pending()?.email;
    if (!email) return;

    if (this.code().length !== CODE_LENGTH) {
      this.formError.set('Kodun 6 hanesini de gir.');
      return;
    }

    this.formError.set(null);
    this.submitting.set(true);

    this.auth.verifyCode({ email, code: this.code() }).subscribe({
      next: (response) => {
        this.submitting.set(false);
        this.notify.success(
          `Hesabın doğrulandı, hoş geldin ${response.fullName}.`,
        );
        void this.router.navigateByUrl('/board');
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.formError.set(
          extractErrorMessage(error, this.i18n.t('verify.failed')),
        );

        // Yanlış kodu silip imleci başa alıyoruz: kullanıcı elle temizlemek
        // zorunda kalmasın.
        this.otp().reset();
        this.code.set('');
      },
    });
  }

  protected resend(): void {
    if (!this.canResend()) return;

    const email = this.pending()?.email;
    if (!email) return;

    this.formError.set(null);
    this.resending.set(true);

    this.auth.resendCode(email).subscribe({
      next: () => {
        this.resending.set(false);
        this.notify.success(this.i18n.t('verify.codeSent'));
        this.otp().reset();
        this.code.set('');
      },
      error: (error: unknown) => {
        this.resending.set(false);
        this.notify.error(
          extractErrorMessage(error, this.i18n.t('verify.sendFailed')),
        );
      },
    });
  }

  /** Kullanıcı yanlış adresle kaydolduysa baştan başlayabilsin. */
  protected startOver(): void {
    this.auth.clearPending();
    void this.router.navigateByUrl('/register');
  }
}

/** Verilen ISO tarihe kalan saniye; geçmişse 0. */
function secondsUntil(isoDate: string | undefined, now: number): number {
  if (!isoDate) return 0;

  const target = Date.parse(isoDate);
  if (Number.isNaN(target)) return 0;

  return Math.max(0, Math.ceil((target - now) / 1000));
}
