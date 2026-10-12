import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { PendingVerification } from '../../../core/models/auth.model';
import { AuthService } from '../../../core/services/auth.service';
import { NotifyService } from '../../../core/services/notify.service';
import { extractErrorMessage } from '../../../core/util/http-error';
import { isRecord } from '../../../core/util/json';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, IconComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  /** Guard tarafından eklenen ?returnUrl= - giriş sonrası buraya dönüyoruz. */
  readonly returnUrl = input<string>('');

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly passwordVisible = signal(false);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected submit(): void {
    if (this.submitting()) return;

    this.formError.set(null);

    if (this.form.invalid) {
      // Kullanıcı hiçbir alana dokunmadan "Giriş yap"a bastıysa hataların
      // görünmesi için tüm alanları "dokunulmuş" işaretliyoruz.
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: (response) => {
        this.submitting.set(false);
        this.notify.success(`Hoş geldin, ${response.fullName}.`);
        void this.router.navigateByUrl(this.returnUrl() || '/board');
      },
      error: (error: unknown) => {
        this.submitting.set(false);

        // Şifre doğru ama hesap doğrulanmamış: backend 403 ile birlikte
        // yeni bir kod gönderdiğini bildiriyor, doğrudan o ekrana geçiyoruz.
        const pending = readPendingVerification(error);

        if (pending) {
          this.auth.setPending(pending);
          this.notify.info(this.i18n.t('login.unverified'));
          void this.router.navigateByUrl('/verify');
          return;
        }

        this.formError.set(
          extractErrorMessage(error, this.i18n.t('login.failed')),
        );
      },
    });
  }

  protected togglePassword(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  /** Alanın hatası ne zaman gösterilecek: dokunulduysa ya da gönderildiyse. */
  protected showError(field: 'email' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }
}

/**
 * 403 gövdesini "doğrulama bekleniyor" yanıtı olarak okumaya çalışır.
 * Başka bir 403 (gerçek yetki hatası) gelirse null döner.
 */
function readPendingVerification(error: unknown): PendingVerification | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 403) return null;

  const body: unknown = error.error;
  if (!isRecord(body) || body['status'] !== 'PendingVerification') return null;

  const email = body['email'];
  if (typeof email !== 'string') return null;

  return {
    status: 'PendingVerification',
    email,
    expiresAt: typeof body['expiresAt'] === 'string' ? body['expiresAt'] : '',
    resendAvailableAt:
      typeof body['resendAvailableAt'] === 'string'
        ? body['resendAvailableAt']
        : '',
    teamName: typeof body['teamName'] === 'string' ? body['teamName'] : null,
    devCode: typeof body['devCode'] === 'string' ? body['devCode'] : null,
  };
}
