import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { NotifyService } from '../../../core/services/notify.service';
import { extractErrorMessage } from '../../../core/util/http-error';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { OtpInputComponent } from '../../../shared/ui/otp-input/otp-input.component';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';
import { I18nService } from '../../../core/i18n/i18n.service';

const MIN_PASSWORD_LENGTH = 6;
const CODE_LENGTH = 6;

/**
 * Şifre sıfırlamanın ikinci adımı: e-postaya gelen kod + yeni şifre.
 *
 * Kod ve şifre tek ekranda alınıyor. İkiye bölmek kullanıcıyı iki ayrı
 * beklemeye sokardı, oysa kodun ömrü zaten kısa.
 */
@Component({
  selector: 'app-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, IconComponent, OtpInputComponent],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly pending = this.auth.pendingVerification;

  protected readonly code = signal('');
  protected readonly submitting = signal(false);
  protected readonly resending = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly passwordVisible = signal(false);

  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;

  protected readonly form = this.formBuilder.nonNullable.group({
    newPassword: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
  });

  /** Saniyede bir ilerleyen "şu an" - geri sayımı besliyor. */
  private readonly now = signal(Date.now());

  protected readonly secondsLeft = computed(() =>
    secondsUntil(this.pending()?.expiresAt, this.now()),
  );

  protected readonly expired = computed(() => this.secondsLeft() <= 0);

  protected readonly countdown = computed(() => formatCountdown(this.secondsLeft()));

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // Bu ekrana doğrudan gelinemiyor: önce "şifremi unuttum" adımından
    // geçilip kod istenmiş olmalı.
    if (this.pending() === null) {
      void this.router.navigateByUrl('/forgot-password');
    }
  }

  protected submit(): void {
    if (this.submitting()) return;

    this.formError.set(null);

    const email = this.pending()?.email;
    if (!email) {
      void this.router.navigateByUrl('/forgot-password');
      return;
    }

    if (this.code().length !== CODE_LENGTH) {
      this.formError.set('6 haneli kodu eksiksiz gir.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);

    this.auth
      .resetPassword({
        email,
        code: this.code(),
        newPassword: this.form.controls.newPassword.value,
      })
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          this.notify.success(`Şifren güncellendi, hoş geldin ${response.fullName}.`);
          void this.router.navigateByUrl('/board');
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.formError.set(extractErrorMessage(error, this.i18n.t('reset.failed')));
          // Yanlış kod büyük ihtimalle baştan yazılacak; kutuları boşaltmak
          // kullanıcıyı tek tek silmekten kurtarıyor.
          this.code.set('');
        },
      });
  }

  protected resend(): void {
    const email = this.pending()?.email;
    if (!email || this.resending()) return;

    this.resending.set(true);
    this.formError.set(null);

    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.resending.set(false);
        this.code.set('');
        this.notify.info(this.i18n.t('verify.codeSent'));
      },
      error: (error: unknown) => {
        this.resending.set(false);
        this.formError.set(extractErrorMessage(error, this.i18n.t('reset.sendFailed')));
      },
    });
  }

  protected togglePassword(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected startOver(): void {
    this.auth.clearPending();
    void this.router.navigateByUrl('/forgot-password');
  }

  protected showPasswordError(): boolean {
    const control = this.form.controls.newPassword;
    return control.invalid && (control.touched || control.dirty);
  }
}

/** Verilen ISO tarihe kalan saniye; geçmişse 0. */
function secondsUntil(isoDate: string | undefined, now: number): number {
  if (!isoDate) return 0;

  const target = Date.parse(isoDate);
  if (Number.isNaN(target)) return 0;

  return Math.max(0, Math.floor((target - now) / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
