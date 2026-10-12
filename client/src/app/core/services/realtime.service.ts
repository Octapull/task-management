import { Injectable, inject, signal } from '@angular/core';
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { Subject } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ActivityEntry } from '../models/activity.model';
import { ChecklistItem, TaskComment, TaskItem, TaskItemStatus } from '../models/task.model';
import { parseActivity } from '../util/activity-mapper';
import { readNumber, readProp } from '../util/json';
import {
  isFullTaskPayload,
  parseChecklist,
  parseComment,
  parseTask,
  toStatus,
} from '../util/task-mapper';
import { AuthService } from './auth.service';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Hub'dan gelen bildirimlerin uygulama içi karşılığı. */
export type RealtimeEvent =
  | { type: 'created'; task: TaskItem }
  /** İşin tamamı geldi (içerik, atama ya da durum değişikliği). */
  | { type: 'updated'; task: TaskItem }
  | {
      type: 'assigned';
      id: number;
      status: TaskItemStatus;
      assignedUserId: number;
    }
  | { type: 'status'; id: number; status: TaskItemStatus }
  | { type: 'deleted'; id: number }
  /** İşlem geçmişine yeni bir kayıt düştü. */
  | { type: 'activity'; entry: ActivityEntry }
  /** İşe yorum yazıldı ya da var olan yorum düzenlendi. */
  | { type: 'comment'; comment: TaskComment }
  | { type: 'comment-deleted'; taskId: number; commentId: number }
  /** Kontrol listesi değişti; listenin tamamı geliyor. */
  | { type: 'checklist'; taskId: number; items: ChecklistItem[] }
  /** Bağlantı koptuktan sonra geri geldi: kaçırılan değişiklikler için tam yenileme. */
  | { type: 'resync' };

/**
 * SignalR bağlantısı.
 *
 * Sorumluluğu sadece bağlantıyı ayakta tutmak ve gelen mesajları tiplenmiş
 * olaylara çevirmek. Bu olaylarla ne yapılacağına TaskStore karar veriyor -
 * böylece bağlantı katmanı uygulama durumundan (state) bağımsız kalıyor.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);

  private connection: HubConnection | null = null;

  /** Arayüzdeki yeşil/kırmızı bağlantı göstergesi bunu okuyor. */
  readonly status = signal<ConnectionStatus>('disconnected');

  /** Son mesajın geldiği an - göstergenin ipucu metninde kullanılıyor. */
  readonly lastEventAt = signal<Date | null>(null);

  private readonly events = new Subject<RealtimeEvent>();
  readonly events$ = this.events.asObservable();

  async connect(): Promise<void> {
    if (this.connection !== null) return;

    const connection = new HubConnectionBuilder()
      .withUrl(environment.hubUrl, {
        // WebSocket el sıkışmasına Authorization başlığı eklenemediği için
        // token'ı buradan veriyoruz; backend bunu ?access_token= olarak okuyor
        // (bkz. ServiceCollectionExtensions.AddJwtAuthentication).
        accessTokenFactory: () => this.auth.token() ?? '',
      })
      // Kopan bağlantıyı artan aralıklarla yeniden dener.
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(environment.production ? LogLevel.Error : LogLevel.Warning)
      .build();

    this.registerHandlers(connection);
    this.connection = connection;

    await this.start();
  }

  async disconnect(): Promise<void> {
    const connection = this.connection;
    if (connection === null) return;

    this.connection = null;
    this.status.set('disconnected');

    try {
      await connection.stop();
    } catch {
      // Bağlantı zaten kopmuşsa kapatma hatası bizi ilgilendirmiyor.
    }
  }

  /** Gösterge üzerinden elle yeniden bağlanma. */
  async reconnect(): Promise<void> {
    if (this.connection === null) {
      await this.connect();
      return;
    }

    if (this.connection.state === HubConnectionState.Disconnected) {
      await this.start();
    }
  }

  private async start(): Promise<void> {
    const connection = this.connection;
    if (connection === null) return;

    this.status.set('connecting');

    try {
      await connection.start();
      this.status.set('connected');
    } catch {
      // Otomatik yeniden bağlanma yalnızca kurulmuş bir bağlantı koptuğunda
      // devreye giriyor; ilk denemede başarısızsak kendimiz tekrar deniyoruz.
      this.status.set('disconnected');
      setTimeout(() => void this.retryIfIdle(), 5000);
    }
  }

  private async retryIfIdle(): Promise<void> {
    if (this.connection !== null && this.connection.state === HubConnectionState.Disconnected) {
      await this.start();
    }
  }

  private registerHandlers(connection: HubConnection): void {
    connection.onreconnecting(() => this.status.set('reconnecting'));

    connection.onreconnected(() => {
      this.status.set('connected');
      // Bağlantı kopukken kaçırdığımız değişiklikler olabilir; dinleyen taraf
      // (TaskStore) bu olayı görünce listeyi baştan çekiyor.
      this.events.next({ type: 'resync' });
    });

    connection.onclose(() => this.status.set('disconnected'));

    connection.on('TaskCreated', (payload: unknown) => {
      const task = parseTask(payload);
      if (task === null) return;

      this.emit({ type: 'created', task });
    });

    connection.on('TaskUpdated', (payload: unknown) => {
      const task = parseTask(payload);
      if (task === null) return;

      this.emit({ type: 'updated', task });
    });

    connection.on('TaskAssigned', (payload: unknown) => {
      if (this.emitIfFullTask(payload)) return;

      // Eski kısmi biçim: { Id, Status, AssignedUserId }
      const id = readNumber(payload, 'id');
      const status = toStatus(readProp(payload, 'status'));
      const assignedUserId = readNumber(payload, 'assignedUserId');

      if (id === null || status === null || assignedUserId === null) return;

      this.emit({ type: 'assigned', id, status, assignedUserId });
    });

    connection.on('TaskStatusChanged', (payload: unknown) => {
      if (this.emitIfFullTask(payload)) return;

      const id = readNumber(payload, 'id');
      const status = toStatus(readProp(payload, 'status'));

      if (id === null || status === null) return;

      this.emit({ type: 'status', id, status });
    });

    connection.on('ActivityLogged', (payload: unknown) => {
      const entry = parseActivity(payload);
      if (entry === null) return;

      this.emit({ type: 'activity', entry });
    });

    // Ekleme ve düzenleme aynı olaya düşüyor: iki durumda da yorumun
    // tamamı geliyor ve ekran kaydı id'ye göre yerine koyuyor.
    for (const eventName of ['CommentAdded', 'CommentUpdated']) {
      connection.on(eventName, (payload: unknown) => {
        const comment = parseComment(payload);
        if (comment === null) return;

        this.emit({ type: 'comment', comment });
      });
    }

    // Backend tek tek değil listenin tamamını gönderiyor: sıralama
    // değiştiğinde zaten hepsi etkileniyor.
    connection.on('ChecklistChanged', (payload: unknown) => {
      const taskId = readNumber(payload, 'taskId');
      if (taskId === null) return;

      this.emit({
        type: 'checklist',
        taskId,
        items: parseChecklist(readProp(payload, 'items')),
      });
    });

    connection.on('CommentDeleted', (payload: unknown) => {
      const taskId = readNumber(payload, 'taskId');
      const commentId = readNumber(payload, 'commentId');

      if (taskId === null || commentId === null) return;

      this.emit({ type: 'comment-deleted', taskId, commentId });
    });

    connection.on('TaskDeleted', (payload: unknown) => {
      // Bu olayda backend nesne değil, doğrudan id gönderiyor.
      const id = typeof payload === 'number' ? payload : readNumber(payload, 'id');
      if (id === null) return;

      this.emit({ type: 'deleted', id });
    });
  }

  /**
   * Mesaj işin tamamını taşıyorsa "updated" olarak yayınlar.
   * @returns Yayınlandıysa true; kısmi mesajsa false (çağıran devam eder).
   */
  private emitIfFullTask(payload: unknown): boolean {
    if (!isFullTaskPayload(payload)) return false;

    const task = parseTask(payload);
    if (task === null) return false;

    this.emit({ type: 'updated', task });
    return true;
  }

  private emit(event: RealtimeEvent): void {
    this.lastEventAt.set(new Date());
    this.events.next(event);
  }
}
