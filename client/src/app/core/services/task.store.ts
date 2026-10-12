import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { TaskContentRequest, TaskItem, TaskItemStatus } from '../models/task.model';
import { extractErrorMessage } from '../util/http-error';
import { I18nService } from '../i18n/i18n.service';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';
import { RealtimeEvent, RealtimeService } from './realtime.service';
import { TaskApiService } from './task-api.service';

/** Filtre çubuğundaki hızlı seçenekler. */
export type QuickFilter = 'all' | 'mine' | 'open' | 'completed';

/**
 * Uygulamanın tek iş listesi kaynağı.
 *
 * Sunucudan gelen veri, SignalR bildirimleri ve kullanıcının kendi
 * değişiklikleri hep bu tek listede birleşiyor. Bileşenler listeyi doğrudan
 * değiştirmez; buradaki metotları çağırır.
 *
 * Yazma işlemlerinde iyimser (optimistic) güncelleme yapıyoruz: arayüz hemen
 * güncelleniyor, istek başarısız olursa önceki hale geri dönülüyor. Sürükle-
 * bırakta kartın elinden bırakır bırakmaz yerine oturması için gerekli.
 */
@Injectable({ providedIn: 'root' })
export class TaskStore {
  private readonly api = inject(TaskApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly notify = inject(NotifyService);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);

  private readonly items = signal<TaskItem[]>([]);
  private realtimeSubscription: Subscription | null = null;
  private initialized = false;

  readonly tasks = this.items.asReadonly();
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  /** İlk yükleme tamamlandı mı? İskelet ekranını buna göre gösteriyoruz. */
  readonly loaded = signal(false);

  // --- Filtre durumu -------------------------------------------------------
  readonly search = signal('');
  readonly quickFilter = signal<QuickFilter>('all');

  readonly connectionStatus = this.realtime.status;
  readonly lastEventAt = this.realtime.lastEventAt;

  /** Arama + hızlı filtre uygulanmış liste. */
  readonly filteredTasks = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('tr');
    const filter = this.quickFilter();
    const myId = this.auth.userId();

    return this.items().filter((task) => {
      if (term.length > 0) {
        const haystack = `${task.title} ${task.description}`.toLocaleLowerCase('tr');
        if (!haystack.includes(term)) return false;
      }

      switch (filter) {
        case 'mine':
          return task.assignedUserId === myId;
        case 'open':
          return task.status === TaskItemStatus.Open;
        case 'completed':
          return task.status === TaskItemStatus.Completed;
        default:
          return true;
      }
    });
  });

  /** Kanban kolonları - filtrelenmiş liste durumlara göre bölünmüş hali. */
  readonly columns = computed(() => {
    const grouped: Record<TaskItemStatus, TaskItem[]> = {
      [TaskItemStatus.Open]: [],
      [TaskItemStatus.Taken]: [],
      [TaskItemStatus.Completed]: [],
    };

    for (const task of this.filteredTasks()) {
      grouped[task.status].push(task);
    }

    for (const status of Object.keys(grouped)) {
      grouped[Number(status) as TaskItemStatus].sort(compareTasks);
    }

    return grouped;
  });

  /** Üst çubuktaki özet sayaçlar - filtreden etkilenmez, hep toplamı gösterir. */
  readonly stats = computed(() => {
    const all = this.items();
    const myId = this.auth.userId();

    return {
      total: all.length,
      open: all.filter((t) => t.status === TaskItemStatus.Open).length,
      taken: all.filter((t) => t.status === TaskItemStatus.Taken).length,
      completed: all.filter((t) => t.status === TaskItemStatus.Completed).length,
      mine: all.filter((t) => t.assignedUserId === myId && t.status !== TaskItemStatus.Completed)
        .length,
      overdue: all.filter(isOverdue).length,
    };
  });

  // --- Yaşam döngüsü -------------------------------------------------------

  /** Pano kabuğu (shell) açılırken bir kez çağrılır. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.reload();
    void this.realtime.connect();

    this.realtimeSubscription = this.realtime.events$.subscribe((event) =>
      this.applyRealtimeEvent(event),
    );
  }

  /** Çıkış yapıldığında ya da kabuk kapandığında. */
  destroy(): void {
    this.realtimeSubscription?.unsubscribe();
    this.realtimeSubscription = null;
    this.initialized = false;

    void this.realtime.disconnect();
    this.items.set([]);
    this.loaded.set(false);
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.api.getAll().subscribe({
      next: (tasks) => {
        this.items.set(tasks);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: (error: unknown) => {
        this.loadError.set(extractErrorMessage(error, this.i18n.t('task.loadFailed')));
        this.loading.set(false);
        this.loaded.set(true);
      },
    });
  }

  // --- Yazma işlemleri -----------------------------------------------------

  create(request: TaskContentRequest): Promise<boolean> {
    return new Promise((resolve) => {
      this.api.create(request).subscribe({
        next: (task) => {
          // SignalR aynı işi tekrar gönderebilir; upsert olduğu için sorun değil.
          if (task !== null) this.upsert(task);
          this.notify.success(this.i18n.t('task.created'));
          resolve(true);
        },
        error: (error: unknown) => {
          this.notify.error(extractErrorMessage(error, this.i18n.t('task.createFailed')));
          resolve(false);
        },
      });
    });
  }

  update(id: number, request: TaskContentRequest): Promise<boolean> {
    return new Promise((resolve) => {
      this.api.update(id, request).subscribe({
        next: (task) => {
          if (task !== null) this.upsert(task);
          this.notify.success(this.i18n.t('task.updated'));
          resolve(true);
        },
        error: (error: unknown) => {
          this.notify.error(extractErrorMessage(error, this.i18n.t('task.updateFailed')));
          resolve(false);
        },
      });
    });
  }

  /**
   * Boştaki bir işi üstlenir. Backend yalnızca "Boşta" durumundakileri kabul
   * ettiği için, iş bu arada başkası tarafından alınmışsa 409 döner ve arayüz
   * eski haline döner.
   */
  claim(id: number): void {
    const myId = this.auth.userId();
    if (myId === null) return;

    const snapshot = this.items();

    this.patch(id, {
      status: TaskItemStatus.Taken,
      assignedUserId: myId,
      // Backend işi üstlenirken başlangıç saatini de yazıyor.
      startedAt: new Date().toISOString(),
    });

    this.api.claim(id, myId).subscribe({
      error: (error: unknown) => {
        this.items.set(snapshot);
        this.notify.error(extractErrorMessage(error, this.i18n.t('task.claimFailed')));
      },
    });
  }

  /** İşi başka bir kullanıcıya atar / devreder. */
  assignTo(task: TaskItem, userId: number): void {
    const snapshot = this.items();

    this.patch(task.id, {
      assignedUserId: userId,
      // Boştaki bir iş atandığında otomatik olarak "devam ediyor" olur.
      status: task.status === TaskItemStatus.Open ? TaskItemStatus.Taken : task.status,
      // Devredilen işin başlangıcı değişmez; yalnızca henüz yoksa doldurulur.
      startedAt: task.startedAt ?? new Date().toISOString(),
    });

    this.api.setAssignee(task.id, userId).subscribe({
      error: (error: unknown) => {
        this.items.set(snapshot);
        this.notify.error(extractErrorMessage(error, this.i18n.t('task.assignFailed')));
      },
    });
  }

  /** Atamayı kaldırır; iş havuza (Boşta) döner. */
  unassign(id: number): void {
    const snapshot = this.items();

    this.patch(id, {
      assignedUserId: null,
      status: TaskItemStatus.Open,
      // İş havuza dönüyor: sayaç bir sonraki üstlenen için sıfırlanır.
      startedAt: null,
      completedAt: null,
    });

    this.api.removeAssignee(id).subscribe({
      error: (error: unknown) => {
        this.items.set(snapshot);
        this.notify.error(extractErrorMessage(error, this.i18n.t('task.unassignFailed')));
      },
    });
  }

  changeStatus(id: number, status: TaskItemStatus): void {
    const snapshot = this.items();
    const current = this.items().find((task) => task.id === id);
    const now = new Date().toISOString();

    this.patch(id, {
      status,
      completedAt: status === TaskItemStatus.Completed ? now : null,
      // Havuza dönen işin başlangıcı silinir; havuzdan çıkan işte ise yalnızca
      // henüz yoksa doldurulur (tamamlanan işin başlangıcı korunmalı).
      startedAt: status === TaskItemStatus.Open ? null : (current?.startedAt ?? now),
      // Backend işi havuza döndürürken atamayı da kaldırıyor; arayüz de
      // aynısını yapmalı ki iyimser güncelleme sunucuyla aynı sonucu göstersin.
      ...(status === TaskItemStatus.Open ? { assignedUserId: null } : {}),
    });

    this.api.updateStatus(id, status).subscribe({
      error: (error: unknown) => {
        this.items.set(snapshot);
        this.notify.error(extractErrorMessage(error, this.i18n.t('task.statusFailed')));
      },
    });
  }

  /**
   * Sürükle-bırak ve kart menüsünün ortak giriş noktası.
   *
   * "Boşta -> Devam ediyor" geçişi backend'de ayrı bir uç nokta (assign):
   * hem durumu hem atanan kişiyi aynı anda değiştirdiği ve yarış durumunu
   * (aynı işi iki kişinin alması) engellediği için.
   */
  moveTo(task: TaskItem, target: TaskItemStatus): void {
    if (task.status === target) return;

    if (target === TaskItemStatus.Taken && task.status === TaskItemStatus.Open) {
      this.claim(task.id);
      return;
    }

    this.changeStatus(task.id, target);
  }

  remove(id: number): void {
    const snapshot = this.items();

    this.items.update((tasks) => tasks.filter((task) => task.id !== id));

    this.api.delete(id).subscribe({
      next: () => this.notify.success(this.i18n.t('task.deleted')),
      error: (error: unknown) => {
        this.items.set(snapshot);
        this.notify.error(extractErrorMessage(error, this.i18n.t('task.deleteFailed')));
      },
    });
  }

  /**
   * Sunucudan taze gelen bir işi listeye yazar.
   *
   * Etiket gibi, store üzerinden değil doğrudan API'den değiştirilen alanlar
   * için: pano ile detay sayfasının aynı şeyi göstermesini sağlıyor.
   */
  replace(task: TaskItem): void {
    this.upsert(task);
  }

  // --- Anlık güncellemeler -------------------------------------------------

  private applyRealtimeEvent(event: RealtimeEvent): void {
    switch (event.type) {
      case 'created':
      case 'updated':
        this.upsert(event.task);
        break;

      case 'assigned':
        this.patch(event.id, {
          status: event.status,
          assignedUserId: event.assignedUserId,
        });
        break;

      case 'status':
        this.patch(event.id, { status: event.status });
        break;

      case 'deleted':
        this.items.update((tasks) => tasks.filter((t) => t.id !== event.id));
        break;

      case 'resync':
        this.reload();
        break;
    }
  }

  // --- Liste yardımcıları --------------------------------------------------

  private upsert(task: TaskItem): void {
    this.items.update((tasks) => {
      const index = tasks.findIndex((t) => t.id === task.id);
      if (index === -1) return [task, ...tasks];

      const next = [...tasks];
      next[index] = task;
      return next;
    });
  }

  private patch(id: number, changes: Partial<TaskItem>): void {
    this.items.update((tasks) =>
      tasks.map((task) => (task.id === id ? { ...task, ...changes } : task)),
    );
  }
}

/**
 * Kolon içi sıralama: önce yüksek öncelik, sonra en yakın teslim tarihi,
 * en son yeni eklenen. Backend'de sıra bilgisi tutulmadığı için sıralama
 * arayüzde belirleniyor.
 */
function compareTasks(a: TaskItem, b: TaskItem): number {
  if (a.priority !== b.priority) return b.priority - a.priority;

  if (a.dueDate !== b.dueDate) {
    // Tarihi olmayanlar listenin sonuna.
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  }

  return b.createdAt.localeCompare(a.createdAt);
}

function isOverdue(task: TaskItem): boolean {
  if (task.dueDate === null || task.status === TaskItemStatus.Completed) {
    return false;
  }

  return Date.parse(task.dueDate) < Date.now();
}
