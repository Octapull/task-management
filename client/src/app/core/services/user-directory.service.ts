import { Injectable, computed, inject, signal } from '@angular/core';

import { UserSummary } from '../models/user.model';
import { AuthService } from './auth.service';
import { UserApiService } from './user-api.service';
import { I18nService } from '../i18n/i18n.service';

/**
 * Ekip üyelerinin adlarını tutar ve kullanıcı id'sini ekranda gösterilebilir
 * bir isme çevirir.
 *
 * Liste `GET /api/users`'tan bir kez çekiliyor; kartlar, liste satırları ve
 * atama menüsü hep buradan okuyor.
 */
@Injectable({ providedIn: 'root' })
export class UserDirectoryService {
  private readonly i18n = inject(I18nService);
  private readonly api = inject(UserApiService);
  private readonly auth = inject(AuthService);

  private readonly items = signal<UserSummary[]>([]);
  private loaded = false;

  /** Atama menüsünde listelenen kullanıcılar. */
  readonly users = this.items.asReadonly();

  private readonly byId = computed(() => {
    const map = new Map<number, UserSummary>();
    for (const user of this.items()) map.set(user.id, user);
    return map;
  });

  /** Pano açılırken bir kez çağrılıyor. */
  load(): void {
    if (this.loaded) return;
    this.loaded = true;

    this.api.getAll().subscribe({
      next: (users) => this.items.set(users),
      error: () => {
        // Kullanıcı listesi çekilemezse arayüz çalışmaya devam etmeli:
        // isimler "Kullanıcı #3" olarak görünür. Tekrar denenebilsin diye
        // bayrağı geri alıyoruz.
        this.loaded = false;
      },
    });
  }

  reset(): void {
    this.items.set([]);
    this.loaded = false;
  }

  isMe(userId: number | null): boolean {
    return userId !== null && userId === this.auth.userId();
  }

  displayName(userId: number | null): string {
    if (userId === null) return this.i18n.t('user.unassigned');
    if (this.isMe(userId)) return this.auth.fullName() || 'Ben';

    // Liste henüz gelmediyse ya da kullanıcı silinmişse id'ye düşüyoruz.
    return this.byId().get(userId)?.fullName ?? `Kullanıcı #${userId}`;
  }

  /** Avatar dairesinin içindeki 1-2 harf. */
  initials(userId: number | null): string {
    if (userId === null) return '?';

    const name = this.isMe(userId)
      ? this.auth.fullName()
      : (this.byId().get(userId)?.fullName ?? '');

    return initialsOf(name) || `${userId}`;
  }
}

export function initialsOf(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) return '';
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toLocaleUpperCase('tr');
  }

  const first = parts[0]!.charAt(0);
  const last = parts[parts.length - 1]!.charAt(0);

  return `${first}${last}`.toLocaleUpperCase('tr');
}
