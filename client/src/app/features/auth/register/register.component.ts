import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

import { TeamMode } from '../../../core/models/auth.model';
import { AuthService } from '../../../core/services/auth.service';
import { NotifyService } from '../../../core/services/notify.service';
import { TeamApiService } from '../../../core/services/team-api.service';
import { extractErrorMessage } from '../../../core/util/http-error';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';
import { I18nService } from '../../../core/i18n/i18n.service';

const MIN_PASSWORD_LENGTH = 6;
const MIN_TEAM_CODE_LENGTH = 6;

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, IconComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly teams = inject(TeamApiService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly passwordVisible = signal(false);

  /** Şablonun sayı yerine isimle karşılaştırma yapabilmesi için. */
  protected readonly TeamMode = TeamMode;

  protected readonly form = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: [
      '',
      [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)],
    ],
    mode: [TeamMode.Create as TeamMode],
    // Bu ikisinin doğrulayıcıları sabit değil: hangisinin zorunlu olduğu
    // seçilen moda bağlı, aşağıdaki selectMode() ayarlıyor.
    teamName: ['', [Validators.required, Validators.minLength(2)]],
    teamCode: [''],
  });

  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;

  /** Seçili mod - şablondaki koşullar bunu okuyor. */
  protected readonly mode = toSignal(this.form.controls.mode.valueChanges, {
    initialValue: this.form.controls.mode.value,
  });

  /** Şifre alanının anlık değeri - güç göstergesini besliyor. */
  private readonly password = toSignal(
    this.form.controls.password.valueChanges,
    { initialValue: '' },
  );

  /** 0 = zayıf, 1 = orta, 2 = güçlü. */
  protected readonly passwordStrength = computed(() =>
    scorePassword(this.password()),
  );

  /**
   * Girilen ekip kodunun anlık kontrolü.
   *
   * Kullanıcı yazmayı bıraktıktan 400ms sonra soruluyor; amaç "doğru ekibe
   * katılıyor muyum" sorusunu form gönderilmeden yanıtlamak.
   */
  protected readonly teamCheck = toSignal(
    this.form.controls.teamCode.valueChanges.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap((code) => {
        const normalized = normalizeTeamCode(code);

        // Kısa girdide sunucuya hiç gitmiyoruz: kullanıcı hala yazıyor.
        if (normalized.length < MIN_TEAM_CODE_LENGTH) {
          return of(null);
        }

        return this.teams.validateCode(normalized);
      }),
    ),
    { initialValue: null },
  );

  /** Kod alanı doldurulmuş ama geçersiz mi? Uyarıyı bu tetikliyor. */
  protected readonly teamCodeRejected = computed(
    () => this.teamCheck()?.valid === false,
  );

  protected selectMode(mode: TeamMode): void {
    if (this.form.controls.mode.value === mode) return;

    this.form.controls.mode.setValue(mode);
    this.formError.set(null);

    const { teamName, teamCode } = this.form.controls;

    // Gizlenen alanın doğrulayıcısı da kalkmalı, yoksa form görünmeyen bir
    // hata yüzünden geçersiz kalır ve buton sessizce çalışmaz.
    if (mode === TeamMode.Create) {
      teamName.setValidators([Validators.required, Validators.minLength(2)]);
      teamCode.clearValidators();
      teamCode.setValue('');
    } else {
      teamCode.setValidators([
        Validators.required,
        Validators.minLength(MIN_TEAM_CODE_LENGTH),
      ]);
      teamName.clearValidators();
      teamName.setValue('');
    }

    teamName.updateValueAndValidity();
    teamCode.updateValueAndValidity();

    // Mod değişince önceki modda birikmiş "dokunuldu" işaretleri kalmasın.
    teamName.markAsUntouched();
    teamCode.markAsUntouched();
  }

  protected submit(): void {
    if (this.submitting()) return;

    this.formError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const joining = raw.mode === TeamMode.Join;

    // Kod sunucuya sorulmuş ve reddedilmişse isteği hiç göndermiyoruz.
    if (joining && this.teamCodeRejected()) {
      this.formError.set(this.i18n.t('register.teamCodeRejected'));
      return;
    }

    this.submitting.set(true);

    this.auth
      .register({
        fullName: raw.fullName,
        email: raw.email,
        password: raw.password,
        mode: raw.mode,
        teamName: joining ? undefined : raw.teamName,
        teamCode: joining ? normalizeTeamCode(raw.teamCode) : undefined,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.notify.success(this.i18n.t('register.codeSent'));
          void this.router.navigateByUrl('/verify');
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.formError.set(
            extractErrorMessage(error, this.i18n.t('register.failed')),
          );
        },
      });
  }

  protected togglePassword(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected showError(
    field: 'fullName' | 'email' | 'password' | 'teamName' | 'teamCode',
  ): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }
}

/** Kod her zaman büyük harf ve boşluksuz karşılaştırılıyor (backend de öyle). */
function normalizeTeamCode(code: string): string {
  return code.trim().replace(/\s/g, '').toUpperCase();
}

/**
 * Basit bir şifre gücü ölçütü: uzunluk + karakter çeşitliliği.
 * Amaç kullanıcıyı yönlendirmek, kriptografik bir güvence vermek değil.
 */
function scorePassword(password: string): number {
  if (password.length < MIN_PASSWORD_LENGTH) return 0;

  let score = 0;
  if (password.length >= 10) score++;
  if (/[A-ZÇĞİÖŞÜ]/.test(password) && /[a-zçğıöşü]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^\w\s]/.test(password)) score++;

  if (score <= 1) return 0;
  return score === 2 ? 1 : 2;
}
