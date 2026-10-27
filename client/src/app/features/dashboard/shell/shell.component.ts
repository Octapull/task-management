import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { I18nService } from '../../../core/i18n/i18n.service';
import { MessageKey } from '../../../core/i18n/messages';
import { AuthService } from '../../../core/services/auth.service';
import { LabelStore } from '../../../core/services/label.store';
import { QuickFilter, TaskStore } from '../../../core/services/task.store';
import { UserDirectoryService, initialsOf } from '../../../core/services/user-directory.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { LanguagePickerComponent } from '../../../shared/ui/language-picker/language-picker.component';
import { ThemeToggleComponent } from '../../../shared/ui/theme-toggle/theme-toggle.component';
import { LogoComponent } from '../../../shared/ui/logo/logo.component';
import { ConnectionIndicatorComponent } from '../connection-indicator/connection-indicator.component';
import { TaskActionsService } from '../task-actions.service';

interface FilterOption {
  value: QuickFilter;
  /** Etiket doğrudan yazılmıyor: dil değişince yeniden çözülmesi gerekiyor. */
  labelKey: MessageKey;
}

/**
 * Giriş yapmış kullanıcının gördüğü ana çerçeve: üst çubuk, filtre satırı ve
 * görünüm (pano/liste) için router-outlet.
 *
 * Veri yükleme ve SignalR bağlantısı burada başlatılıyor - iki görünüm de aynı
 * veriyi paylaştığı için görünüm değiştirmek yeniden yükleme tetiklemiyor.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatMenuModule,
    MatTooltipModule,
    IconComponent,
    LogoComponent,
    LanguagePickerComponent,
    ThemeToggleComponent,
    ConnectionIndicatorComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly actions = inject(TaskActionsService);
  private readonly users = inject(UserDirectoryService);
  private readonly labels = inject(LabelStore);
  private readonly router = inject(Router);

  protected readonly store = inject(TaskStore);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Arama kutusu ve sayaç/filtre satırı yalnızca iş listelerinde anlamlı;
   * profil ve işlem geçmişi ekranlarında gizleniyorlar.
   */
  protected readonly showTaskTools = computed(() => {
    const url = this.currentUrl();
    return url.startsWith('/board') || url.startsWith('/list');
  });

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly userName = this.auth.fullName;
  /** Rol API'den "Owner"/"Member" olarak geliyor; ekranda çevrilmiş hali durur. */
  protected readonly userRole = computed(() => {
    const role = this.auth.currentUser()?.role;
    if (!role) return '';

    return this.i18n.t(role === 'Owner' ? 'role.owner' : 'role.member');
  });
  protected readonly userInitials = computed(() => initialsOf(this.auth.fullName()));

  protected readonly filters: readonly FilterOption[] = [
    { value: 'all', labelKey: 'filters.all' },
    { value: 'mine', labelKey: 'filters.mine' },
    { value: 'open', labelKey: 'filters.open' },
    { value: 'completed', labelKey: 'filters.completed' },
  ];

  ngOnInit(): void {
    this.store.init();
    // Kart ve listelerde isim gösterebilmek, atama menüsünü doldurabilmek için.
    this.users.load();
    this.labels.load();
  }

  ngOnDestroy(): void {
    // Çıkış yapıldığında ya da uygulamadan ayrıldığında bağlantıyı bırak.
    this.store.destroy();
    this.users.reset();
    this.labels.reset();
  }

  /** "/" tuşu aramaya odaklanır - yazı yazılan bir alanda değilken. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName.toLowerCase();

    if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
      return;
    }

    event.preventDefault();
    this.searchInput()?.nativeElement.focus();
  }

  protected onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.store.search.set(input.value);
  }

  protected clearSearch(): void {
    this.store.search.set('');
    this.searchInput()?.nativeElement.focus();
  }

  protected setFilter(filter: QuickFilter): void {
    this.store.quickFilter.set(filter);
  }

  protected openCreateDialog(): void {
    this.actions.openCreateDialog();
  }


  protected logout(): void {
    this.auth.logout();
  }
}
