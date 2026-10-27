import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';

import { TaskItemStatus } from '../models/task.model';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';
import { RealtimeEvent, RealtimeService } from './realtime.service';
import { TaskStore } from './task.store';

const ME = 7;
const TASKS_URL = '/api/tasks';

/**
 * Store'un can alıcı davranışı iyimser güncelleme: arayüz hemen değişiyor,
 * istek başarısız olursa önceki hale dönüyor. Sürükle-bırakta kartın yerine
 * oturması buna bağlı, bu yüzden her yazma işleminin geri alma yolu ayrı
 * ayrı test ediliyor.
 */
describe('TaskStore', () => {
  let store: TaskStore;
  let httpMock: HttpTestingController;
  let errors: string[];

  function makeRaw(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      title: 'API dokümantasyonu',
      description: '',
      status: TaskItemStatus.Open,
      priority: 1,
      dueDate: null,
      assignedUserId: null,
      createdByUserId: 5,
      createdAt: '2026-08-01T10:00:00Z',
      startedAt: null,
      completedAt: null,
      ...overrides,
    };
  }

  /** Store'u verilen işlerle doldurur. */
  function seed(raw: Record<string, unknown>[]): void {
    store.reload();
    httpMock.expectOne(TASKS_URL).flush(raw);
  }

  function task(id = 1) {
    return store.tasks().find((item) => item.id === id)!;
  }

  beforeEach(() => {
    errors = [];

    const realtimeStub = {
      status: signal('connected'),
      lastEventAt: signal<Date | null>(null),
      events$: new Subject<RealtimeEvent>().asObservable(),
      connect: () => Promise.resolve(),
      disconnect: () => Promise.resolve(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RealtimeService, useValue: realtimeStub },
        {
          provide: NotifyService,
          useValue: {
            success: () => undefined,
            info: () => undefined,
            error: (message: string) => errors.push(message),
          },
        },
        { provide: AuthService, useValue: { userId: () => ME } },
      ],
    });

    store = TestBed.inject(TaskStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reload gelen işleri listeye alır', () => {
    seed([makeRaw(), makeRaw({ id: 2, title: 'Test yaz' })]);

    expect(store.tasks().length).toBe(2);
    expect(store.loaded()).toBe(true);
  });

  it('reload başarısız olursa hata mesajını saklar', () => {
    store.reload();
    httpMock.expectOne(TASKS_URL).flush('Patladı', { status: 500, statusText: 'Server Error' });

    expect(store.loadError()).toBeTruthy();
    // Yükleme bitmiş sayılmalı, aksi halde ekranda iskelet takılı kalır.
    expect(store.loaded()).toBe(true);
  });

  describe('claim', () => {
    it('istek dönmeden önce arayüzü günceller', () => {
      seed([makeRaw()]);

      store.claim(1);

      expect(task().status).toBe(TaskItemStatus.Taken);
      expect(task().assignedUserId).toBe(ME);
      expect(task().startedAt).not.toBeNull();

      httpMock.expectOne(`${TASKS_URL}/1/assign?userId=${ME}`).flush(null);
    });

    it('istek başarısız olursa önceki hale döner', () => {
      seed([makeRaw()]);

      store.claim(1);
      httpMock
        .expectOne(`${TASKS_URL}/1/assign?userId=${ME}`)
        .flush('Bu iş zaten alınmış.', { status: 409, statusText: 'Conflict' });

      expect(task().status).toBe(TaskItemStatus.Open);
      expect(task().assignedUserId).toBeNull();
      expect(task().startedAt).toBeNull();
      expect(errors.length).toBe(1);
    });
  });

  describe('unassign', () => {
    it('işi havuza döndürür ve sayaçları sıfırlar', () => {
      seed([
        makeRaw({
          status: TaskItemStatus.Taken,
          assignedUserId: 3,
          startedAt: '2026-08-02T09:00:00Z',
        }),
      ]);

      store.unassign(1);

      expect(task().status).toBe(TaskItemStatus.Open);
      expect(task().assignedUserId).toBeNull();
      expect(task().startedAt).toBeNull();

      httpMock.expectOne(`${TASKS_URL}/1/assignee`).flush(null);
    });

    it('hata durumunda atamayı geri getirir', () => {
      seed([
        makeRaw({
          status: TaskItemStatus.Taken,
          assignedUserId: 3,
          startedAt: '2026-08-02T09:00:00Z',
        }),
      ]);

      store.unassign(1);
      httpMock
        .expectOne(`${TASKS_URL}/1/assignee`)
        .flush('Olmadı', { status: 500, statusText: 'Server Error' });

      expect(task().assignedUserId).toBe(3);
      expect(task().startedAt).toBe('2026-08-02T09:00:00Z');
    });
  });

  describe('changeStatus', () => {
    it('tamamlamada bitiş saatini yazar', () => {
      seed([makeRaw({ status: TaskItemStatus.Taken, assignedUserId: ME })]);

      store.changeStatus(1, TaskItemStatus.Completed);

      expect(task().status).toBe(TaskItemStatus.Completed);
      expect(task().completedAt).not.toBeNull();

      httpMock.expectOne(`${TASKS_URL}/1/status?status=${TaskItemStatus.Completed}`).flush(null);
    });

    it('havuza dönüşte atamayı da kaldırır', () => {
      seed([makeRaw({ status: TaskItemStatus.Taken, assignedUserId: 3 })]);

      store.changeStatus(1, TaskItemStatus.Open);

      // Backend de aynısını yapıyor; arayüz farklı gösterirse SignalR
      // mesajı geldiğinde kart yerinden zıplardı.
      expect(task().assignedUserId).toBeNull();

      httpMock.expectOne(`${TASKS_URL}/1/status?status=${TaskItemStatus.Open}`).flush(null);
    });

    it('hata durumunda eski duruma döner', () => {
      seed([makeRaw({ status: TaskItemStatus.Taken, assignedUserId: ME })]);

      store.changeStatus(1, TaskItemStatus.Completed);
      httpMock
        .expectOne(`${TASKS_URL}/1/status?status=${TaskItemStatus.Completed}`)
        .flush('Olmadı', { status: 500, statusText: 'Server Error' });

      expect(task().status).toBe(TaskItemStatus.Taken);
      expect(task().completedAt).toBeNull();
    });
  });

  describe('moveTo', () => {
    it('Boşta -> Devam ediyor geçişini üstlenme ucuna yönlendirir', () => {
      seed([makeRaw()]);

      store.moveTo(task(), TaskItemStatus.Taken);

      // Durum ucu değil atama ucu çağrılmalı: yarış durumunu backend
      // yalnızca orada engelliyor.
      httpMock.expectOne(`${TASKS_URL}/1/assign?userId=${ME}`).flush(null);
    });

    it('aynı kolona bırakmada istek atmaz', () => {
      seed([makeRaw()]);

      store.moveTo(task(), TaskItemStatus.Open);

      httpMock.expectNone(() => true);
    });
  });

  describe('remove', () => {
    it('işi hemen listeden çıkarır', () => {
      seed([makeRaw(), makeRaw({ id: 2 })]);

      store.remove(1);

      expect(store.tasks().map((t) => t.id)).toEqual([2]);

      httpMock.expectOne(`${TASKS_URL}/1`).flush(null);
    });

    it('yetki hatasında işi geri koyar', () => {
      seed([makeRaw(), makeRaw({ id: 2 })]);

      store.remove(1);
      httpMock
        .expectOne(`${TASKS_URL}/1`)
        .flush('Bu işi yalnızca oluşturan kişi ya da ekip sahibi silebilir.', {
          status: 403,
          statusText: 'Forbidden',
        });

      expect(store.tasks().map((t) => t.id)).toEqual([1, 2]);
      expect(errors[0]).toContain('ekip sahibi');
    });
  });

  describe('kolonlar ve sayaçlar', () => {
    it('işleri duruma göre gruplar', () => {
      seed([
        makeRaw(),
        makeRaw({ id: 2, status: TaskItemStatus.Taken, assignedUserId: ME }),
        makeRaw({ id: 3, status: TaskItemStatus.Completed }),
      ]);

      const columns = store.columns();

      expect(columns[TaskItemStatus.Open].length).toBe(1);
      expect(columns[TaskItemStatus.Taken].length).toBe(1);
      expect(columns[TaskItemStatus.Completed].length).toBe(1);
    });

    it('arama filtresi başlık ve açıklamada arar', () => {
      seed([makeRaw(), makeRaw({ id: 2, title: 'Test yaz' })]);

      store.search.set('test');

      expect(store.filteredTasks().map((t) => t.id)).toEqual([2]);
    });

    it('sayaçlar filtreden etkilenmez', () => {
      seed([makeRaw(), makeRaw({ id: 2, title: 'Test yaz' })]);

      store.search.set('test');

      // Üst çubuk her zaman toplamı gösteriyor.
      expect(store.stats().total).toBe(2);
    });

    it('"bana ait" sayacı tamamlananları saymaz', () => {
      seed([
        makeRaw({ id: 1, status: TaskItemStatus.Taken, assignedUserId: ME }),
        makeRaw({ id: 2, status: TaskItemStatus.Completed, assignedUserId: ME }),
      ]);

      expect(store.stats().mine).toBe(1);
    });
  });
});
