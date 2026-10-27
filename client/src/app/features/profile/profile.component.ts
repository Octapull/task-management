import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { UserProfile } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
import { UserApiService } from '../../core/services/user-api.service';
import { UserDirectoryService } from '../../core/services/user-directory.service';
import { extractErrorMessage } from '../../core/util/http-error';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { formatFullDate } from '../../shared/util/date';
import { I18nService } from '../../core/i18n/i18n.service';

const MIN_PASSWORD_LENGTH = 6;

/**
 * Kullanıcının kendi hesap ayarları.
 *
 * İki bağımsız form var: hesap bilgileri ve şifre. Ayrı tutuluyorlar çünkü
 * şifre değişikliği mevcut şifreyi doğrulamayı gerektiriyor ve ad/e-posta
 * güncellemesiyle aynı isteğe binmemeli.
 */
@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, IconComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly api = inject(UserApiService);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  protected readonly i18n = inject(I18nService);
  private readonly users = inject(UserDirectoryService);

  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;

  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly savingProfile = signal(false);
  protected readonly profileError = signal<string | null>(null);

  protected readonly savingPassword = signal(false);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly passwordVisible = signal(false);

  protected readonly profileForm = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    // Bildirim tercihi de bu formda: ayrı bir kaydet butonu koymak, tek
    // bir onay kutusu için ekranı gereksiz karmaşıklaştırırdı.
    notifyOnAssignment: [true],
    notifyOnDueDate: [true],
  });

  protected readonly passwordForm = this.formBuilder.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.api.getMe().subscribe({
      next: (profile) => {
        this.loading.set(false);

        if (profile === null) {
          this.loadError.set(this.i18n.t('profile.readError'));
          return;
        }

        this.profile.set(profile);
        this.profileForm.patchValue({
          fullName: profile.fullName,
          email: profile.email,
          notifyOnAssignment: profile.notifyOnAssignment,
          notifyOnDueDate: profile.notifyOnDueDate,
        });
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(extractErrorMessage(error, this.i18n.t('profile.loadError')));
      },
    });
  }

  protected saveProfile(): void {
    if (this.savingProfile()) return;

    this.profileError.set(null);

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.savingProfile.set(true);

    this.api.updateMe(this.profileForm.getRawValue()).subscribe({
      next: (profile) => {
        this.savingProfile.set(false);

        if (profile === null) return;

        this.profile.set(profile);
        // Üst çubuktaki isim ve baş harfler anında güncellensin.
        this.auth.updateSessionName(profile.fullName);
        // Ekip listesi de eskimiş adı taşıyor; kartlarda doğru görünsün.
        this.users.reset();
        this.users.load();

        this.profileForm.markAsPristine();
        this.notify.success(this.i18n.t('profile.saved'));
      },
      error: (error: unknown) => {
        this.savingProfile.set(false);
        this.profileError.set(extractErrorMessage(error, this.i18n.t('profile.saveFailed')));
      },
    });
  }

  protected changePassword(): void {
    if (this.savingPassword()) return;

    this.passwordError.set(null);

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.savingPassword.set(true);

    this.api.changePassword(this.passwordForm.getRawValue()).subscribe({
      next: () => {
        this.savingPassword.set(false);
        // Alanları boşaltıyoruz: şifre ekranda asılı kalmasın.
        this.passwordForm.reset();
        this.notify.success(this.i18n.t('profile.passwordChanged'));
      },
      error: (error: unknown) => {
        this.savingPassword.set(false);
        this.passwordError.set(extractErrorMessage(error, this.i18n.t('profile.passwordFailed')));
      },
    });
  }

  protected togglePassword(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected memberSince(): string {
    const profile = this.profile();
    return profile === null ? '-' : formatFullDate(profile.createdAt);
  }

  protected roleLabel(): string {
    return this.i18n.t(
      this.profile()?.role === 'Admin' ? 'profile.roleAdmin' : 'profile.roleMember',
    );
  }

  protected showProfileError(field: 'fullName' | 'email'): boolean {
    const control = this.profileForm.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  protected showPasswordError(field: 'currentPassword' | 'newPassword'): boolean {
    const control = this.passwordForm.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }
}
