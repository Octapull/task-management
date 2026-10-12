import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';

import { TeamDetail, TeamMember } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
import { TeamApiService } from '../../core/services/team-api.service';
import { extractErrorMessage } from '../../core/util/http-error';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { initialsOf } from '../../core/services/user-directory.service';
import { formatFullDate } from '../../shared/util/date';
import { I18nService } from '../../core/i18n/i18n.service';

/**
 * Ekip yönetimi.
 *
 * Yönetim işlemlerini yalnızca ekip sahibi görüyor ve yetki `team().isOwner`
 * üzerinden okunuyor - token'daki rolden değil. Sebebi: sahiplik devredilince
 * eski sahibin token'ı süresi dolana kadar hâlâ "Owner" diyor; sunucudan
 * dönen taze cevap ise doğruyu söylüyor.
 */
@Component({
  selector: 'app-team',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatTooltipModule, IconComponent],
  templateUrl: './team.component.html',
  styleUrl: './team.component.scss',
})
export class TeamComponent implements OnInit {
  private readonly api = inject(TeamApiService);
  private readonly notify = inject(NotifyService);
  protected readonly i18n = inject(I18nService);
  private readonly confirm = inject(ConfirmService);
  private readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly team = signal<TeamDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly savingName = signal(false);
  protected readonly regenerating = signal(false);

  /** İşlem yapılan üyenin id'si - yalnızca o satırın butonları kilitlensin. */
  protected readonly busyMemberId = signal<number | null>(null);

  protected readonly nameForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
  });

  protected readonly isOwner = computed(() => this.team()?.isOwner === true);

  protected readonly memberCount = computed(() => this.team()?.members.length ?? 0);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.api.getMyTeam().subscribe({
      next: (team) => {
        this.apply(team);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(extractErrorMessage(error, this.i18n.t('team.loadError')));
        this.loading.set(false);
      },
    });
  }

  // --- Ekip adı ------------------------------------------------------------

  protected saveName(): void {
    if (this.savingName()) return;

    if (this.nameForm.invalid) {
      this.nameForm.markAllAsTouched();
      return;
    }

    const name = this.nameForm.controls.name.value.trim();
    if (name === this.team()?.name) return;

    this.savingName.set(true);

    this.api.rename(name).subscribe({
      next: (team) => {
        this.apply(team);
        this.savingName.set(false);
        this.notify.success(this.i18n.t('team.nameSaved'));
      },
      error: (error: unknown) => {
        this.savingName.set(false);
        this.notify.error(extractErrorMessage(error, this.i18n.t('team.nameFailed')));
      },
    });
  }

  // --- Davet kodu ----------------------------------------------------------

  protected async copyCode(): Promise<void> {
    const code = this.team()?.teamCode;
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      this.notify.success(this.i18n.t('team.copied'));
    } catch {
      // Panoya erişim tarayıcı tarafından engellenmiş olabilir (izin, http).
      this.notify.error(this.i18n.t('team.copyFailed'));
    }
  }

  protected async regenerateCode(): Promise<void> {
    if (this.regenerating()) return;

    const confirmed = await this.confirm.ask({
      title: this.i18n.t('team.regenerateTitle'),
      message: this.i18n.t('team.regenerateMessage'),
      subject: this.team()?.name,
      confirmLabel: this.i18n.t('team.regenerateAction'),
      tone: 'warning',
      icon: 'refresh',
    });

    if (!confirmed) return;

    this.regenerating.set(true);

    this.api.regenerateCode().subscribe({
      next: (team) => {
        this.apply(team);
        this.regenerating.set(false);
        this.notify.success(this.i18n.t('team.regenerated'));
      },
      error: (error: unknown) => {
        this.regenerating.set(false);
        this.notify.error(extractErrorMessage(error, this.i18n.t('team.regenerateFailed')));
      },
    });
  }

  // --- Üyeler --------------------------------------------------------------

  protected async transferOwnership(member: TeamMember): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('team.transferTitle'),
      message: this.i18n.t('team.transferMessage', { name: member.fullName }),
      subject: this.team()?.name,
      confirmLabel: this.i18n.t('team.transferAction'),
      tone: 'danger',
      icon: 'shield-check',
    });

    if (!confirmed) return;

    this.busyMemberId.set(member.id);

    this.api.transferOwnership(member.id).subscribe({
      next: (team) => {
        this.apply(team);
        this.busyMemberId.set(null);
        this.notify.success(this.i18n.t('team.transferred', { name: member.fullName }));
      },
      error: (error: unknown) => {
        this.busyMemberId.set(null);
        this.notify.error(extractErrorMessage(error, this.i18n.t('team.transferFailed')));
      },
    });
  }

  protected async removeMember(member: TeamMember): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('team.removeTitle'),
      message: this.i18n.t('team.removeMessage', { name: member.fullName }),
      subject: member.email,
      confirmLabel: this.i18n.t('team.removeAction'),
      tone: 'danger',
      icon: 'trash',
    });

    if (!confirmed) return;

    this.busyMemberId.set(member.id);

    this.api.removeMember(member.id).subscribe({
      next: (team) => {
        this.apply(team);
        this.busyMemberId.set(null);
        this.notify.success(`${member.fullName} ekipten çıkarıldı.`);
      },
      error: (error: unknown) => {
        this.busyMemberId.set(null);
        this.notify.error(extractErrorMessage(error, this.i18n.t('team.removeFailed')));
      },
    });
  }

  // --- Görünüm yardımcıları ------------------------------------------------

  protected isMe(member: TeamMember): boolean {
    return member.id === this.auth.userId();
  }

  protected initials(member: TeamMember): string {
    return initialsOf(member.fullName) || '?';
  }

  protected roleLabel(member: TeamMember): string {
    return this.i18n.t(member.role === 'Owner' ? 'role.owner' : 'role.member');
  }

  protected joinedAt(member: TeamMember): string {
    return formatFullDate(member.createdAt);
  }

  protected showNameError(): boolean {
    const control = this.nameForm.controls.name;
    return control.invalid && (control.touched || control.dirty);
  }

  /** Sunucudan dönen taze ekip bilgisini ekrana ve forma yansıtır. */
  private apply(team: TeamDetail): void {
    this.team.set(team);
    this.nameForm.controls.name.setValue(team.name);
  }
}
