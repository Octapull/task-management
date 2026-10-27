import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';

import {
  ACTIVITY_BADGE,
  ACTIVITY_ICON,
  ACTIVITY_SENTENCE_KEYS,
  ActivityAction,
  ActivityEntry,
  ActivityFilter,
} from '../../core/models/activity.model';
import { ActivityApiService } from '../../core/services/activity-api.service';
import { AuthService } from '../../core/services/auth.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { extractErrorMessage } from '../../core/util/http-error';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { IconName } from '../../shared/ui/icon/icon.constants';
import { formatFullDate, formatRelative } from '../../shared/util/date';
import { I18nService } from '../../core/i18n/i18n.service';
import { MessageKey } from '../../core/i18n/messages';

/** Tek seferde çekilen kayıt sayısı. */
const PAGE_SIZE = 50;

interface FilterOption {
  value: ActivityFilter;
  /** Etiket dile gore cozulsun diye anahtar tutuluyor. */
  labelKey: MessageKey;
}

/** Aynı güne düşen kayıtlar tek başlık altında toplanıyor. */
interface ActivityGroup {
  key: string;
  label: string;
  entries: ActivityEntry[];
}

/**
 * İşlem geçmişi: kim hangi işte ne yaptı.
 *
 * Liste açılışta REST ile çekiliyor, sonrasında SignalR üzerinden gelen yeni
 * kayıtlar başa ekleniyor - ekran açıkken yenilemeye gerek kalmıyor.
 */
/** İşlem satırının biçimlendirilebilir parçası. */
interface EntrySegment {
  kind: 'text' | 'actor' | 'target' | 'task';
  value: string;
  taskId: number | null;
}

@Component({
  selector: 'app-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTooltipModule, IconComponent],
  templateUrl: './activity.component.html',
  styleUrl: './activity.component.scss',
})
export class ActivityComponent implements OnInit, OnDestroy {
  private readonly api = inject(ActivityApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  private subscription: Subscription | null = null;

  /** Şablon sayacı da okuduğu için protected. */
  protected readonly entries = signal<ActivityEntry[]>([]);

  /**
   * Sunucudan çekilmiş satır sayısı. Bilerek `entries().length` değil:
   * SignalR ile başa eklenen kayıtlar da sayılsaydı bir sonraki sayfanın
   * sınırı kayar, aradaki kayıtlar atlanırdı.
   */
  private readonly fetched = signal(0);

  protected readonly total = signal(0);

  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly hasMore = computed(() => this.fetched() < this.total());
  protected readonly filter = signal<ActivityFilter>('all');

  protected readonly filters: readonly FilterOption[] = [
    { value: 'all', labelKey: 'activity.filter.all' },
    { value: 'mine', labelKey: 'activity.filter.mine' },
    { value: 'assignment', labelKey: 'activity.filter.assignment' },
    { value: 'lifecycle', labelKey: 'activity.filter.lifecycle' },
  ];

  protected readonly filteredEntries = computed(() => {
    const filter = this.filter();
    const myId = this.auth.userId();

    return this.entries().filter((entry) => {
      switch (filter) {
        case 'mine':
          return entry.actorUserId === myId;
        case 'assignment':
          return (
            entry.action === ActivityAction.TaskClaimed ||
            entry.action === ActivityAction.TaskAssigned ||
            entry.action === ActivityAction.TaskReleased
          );
        case 'lifecycle':
          return (
            entry.action === ActivityAction.TaskCreated ||
            entry.action === ActivityAction.TaskDeleted ||
            entry.action === ActivityAction.TaskCompleted ||
            entry.action === ActivityAction.TaskReopened
          );
        default:
          return true;
      }
    });
  });

  /** Gün başlıklarıyla gruplanmış liste. */
  protected readonly groups = computed<ActivityGroup[]>(() => {
    const groups: ActivityGroup[] = [];

    for (const entry of this.filteredEntries()) {
      const key = entry.createdAt.slice(0, 10);
      const last = groups[groups.length - 1];

      if (last !== undefined && last.key === key) {
        last.entries.push(entry);
      } else {
        groups.push({ key, label: dayLabel(entry.createdAt, this.i18n.intlLocale()), entries: [entry] });
      }
    }

    return groups;
  });

  protected readonly isEmpty = computed(
    () => !this.loading() && this.filteredEntries().length === 0,
  );

  ngOnInit(): void {
    this.load();

    // Ekran açıkken düşen yeni kayıtlar listenin başına ekleniyor.
    this.subscription = this.realtime.events$.subscribe((event) => {
      if (event.type !== 'activity') return;

      this.entries.update((current) => {
        // Kendi yaptığımız işlem hem REST cevabıyla hem de yayınla gelebilir.
        if (current.some((entry) => entry.id === event.entry.id)) return current;

        // Toplam da artıyor: "daha fazla var mı" hesabı doğru kalsın.
        this.total.update((count) => count + 1);
        this.fetched.update((count) => count + 1);

        return [event.entry, ...current];
      });
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  /** Baştan yükler; "Tekrar dene" ve ilk açılış buradan geçiyor. */
  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.api.getPage(0, PAGE_SIZE).subscribe({
      next: (page) => {
        this.entries.set(page.entries);
        this.fetched.set(page.entries.length);
        this.total.set(page.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(extractErrorMessage(error, this.i18n.t('activity.loadError')));
        this.loading.set(false);
      },
    });
  }

  /** Bir sonraki sayfayı listenin sonuna ekler. */
  protected loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;

    this.loadingMore.set(true);

    this.api.getPage(this.fetched(), PAGE_SIZE).subscribe({
      next: (page) => {
        // Sayfa çekilirken araya yeni kayıt düşmüş olabilir; aynı kaydı iki
        // kez listelememek için id'ye göre eliyoruz.
        this.entries.update((current) => {
          const seen = new Set(current.map((entry) => entry.id));
          return [...current, ...page.entries.filter((e) => !seen.has(e.id))];
        });

        this.fetched.update((count) => count + page.entries.length);
        this.total.set(page.total);
        this.loadingMore.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(extractErrorMessage(error, this.i18n.t('activity.loadMoreError')));
        this.loadingMore.set(false);
      },
    });
  }

  protected setFilter(filter: ActivityFilter): void {
    this.filter.set(filter);
  }

  // --- Satır biçimlendirme -------------------------------------------------

  protected actorName(entry: ActivityEntry): string {
    if (entry.actorUserId !== null && entry.actorUserId === this.auth.userId()) {
      return 'Sen';
    }

    return entry.actorName ?? this.i18n.t('activity.unknownUser');
  }

  protected verb(entry: ActivityEntry): string {
    return ACTIVITY_SENTENCE_KEYS[entry.action];
  }

  protected icon(entry: ActivityEntry): IconName {
    return ACTIVITY_ICON[entry.action];
  }

  protected badgeClass(entry: ActivityEntry): string {
    return ACTIVITY_BADGE[entry.action];
  }

  /** "işi devretti" satırında kime devredildiği. */
  protected targetName(entry: ActivityEntry): string | null {
    if (entry.targetUserId === null) return null;

    if (entry.targetUserId === this.auth.userId()) {
      return this.i18n.t('activity.targetYou');
    }

    const name =
      entry.targetName ?? this.i18n.t('activity.userNumber', { id: entry.targetUserId });

    return this.i18n.t('activity.targetPerson', { name });
  }

  /**
   * Cümleyi biçimlendirilebilir parçalara ayırır.
   *
   * Şablon `{actor} işi {target} devretti: {task}` gibi; yer tutucular
   * dile göre FARKLI SIRADA geliyor. Bölüp her parçaya kendi sınıfını
   * vererek hem doğru kelime sırasını hem de vurgulu görünümü koruyoruz.
   */
  protected segments(entry: ActivityEntry): EntrySegment[] {
    const template = this.i18n.t(ACTIVITY_SENTENCE_KEYS[entry.action]);
    const target = this.targetName(entry);

    return template
      .split(/(\{actor\}|\{target\}|\{task\})/g)
      .filter((part) => part !== '')
      .map((part): EntrySegment => {
        switch (part) {
          case '{actor}':
            return { kind: 'actor', value: this.actorName(entry), taskId: null };
          case '{target}':
            return { kind: 'target', value: target ?? '', taskId: null };
          case '{task}':
            return { kind: 'task', value: entry.taskTitle, taskId: entry.taskId };
          default:
            return { kind: 'text', value: part, taskId: null };
        }
      })
      .filter((segment) => segment.kind !== 'target' || segment.value !== '');
  }

  protected relativeTime(entry: ActivityEntry): string {
    return formatRelative(entry.createdAt);
  }

  protected fullTime(entry: ActivityEntry): string {
    return formatFullDate(entry.createdAt);
  }
}

/** Gün başlığı: "Bugün", "Dün", yoksa tam tarih. */
function dayLabel(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);

  // “Bugün” / “Dün” karşılıkları da Intl'den geliyor; çeviri sözlüğünde
  // ayrıca tutmaya gerek yok (bkz. shared/util/date.ts).
  if (days >= -1 && days <= 0) {
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
      .format(days, 'day');

    return relative.charAt(0).toLocaleUpperCase(locale) + relative.slice(1);
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
