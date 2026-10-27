import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { NotifyService } from '../../../core/services/notify.service';
import { extractErrorMessage } from '../../../core/util/http-error';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';
import { I18nService } from '../../../core/i18n/i18n.service';

/**
 * "Şifremi unuttum" adımı.
 *
 * Backend, adres kayıtlı olmasa bile başarı dönüyor; bu ekran da adresin
 * sistemde olup olmadığına dair hiçbir ipucu vermiyor - her durumda aynı
 * mesajla kod ekranına geçiyor.
 */
@Component({
  selector: 'app-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, IconComponent],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected submit(): void {
    if (this.submitting()) return;

    this.formError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);

    this.auth.forgotPassword(this.form.controls.email.value.trim()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.notify.info(this.i18n.t('forgot.sent'));
        void this.router.navigateByUrl('/reset-password');
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.formError.set(extractErrorMessage(error, this.i18n.t('forgot.failed')));
      },
    });
  }

  protected showError(): boolean {
    const control = this.form.controls.email;
    return control.invalid && (control.touched || control.dirty);
  }
}
