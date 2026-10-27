import { MessageKey } from '../../core/i18n/messages';
import { tr } from '../../core/i18n/messages/tr';
import { TaskItem, TaskItemStatus, TaskPriority } from '../../core/models/task.model';
import {
  assignConfirm,
  claimConfirm,
  criticalUpdateConfirm,
  deleteConfirm,
  isCriticalUpdate,
  moveConfirm,
  unassignConfirm,
} from './task-confirm';

/**
 * Gerçek Türkçe sözlükten besleniyor: beklentiler metnin kendisini
 * doğruladığı için, bir anahtar sözlükten silinirse test de düşer.
 */
function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = tr[key];

  return params
    ? template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
      )
    : template;
}

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 1,
    title: 'API dokümantasyonu',
    description: '',
    status: TaskItemStatus.Open,
    priority: TaskPriority.Medium,
    dueDate: null,
    assignedUserId: null,
    createdByUserId: 5,
    createdAt: '2026-08-01T10:00:00Z',
    startedAt: null,
    completedAt: null,
    checklistTotal: 0,
    checklistDone: 0,
    labelIds: [],
    ...overrides,
  };
}

describe('task-confirm metinleri', () => {
  it('her pencerede işin başlığı görünür', () => {
    const task = makeTask();

    // Kullanıcının yanlış kartı seçtiğini fark edebileceği tek yer burası.
    expect(claimConfirm(t, task).subject).toBe(task.title);
    expect(deleteConfirm(t, task).subject).toBe(task.title);
    expect(unassignConfirm(t, task, 'Ayşe').subject).toBe(task.title);
    expect(moveConfirm(t, task, TaskItemStatus.Completed).subject).toBe(task.title);
  });

  it('silme penceresi geri alınamazlığı vurgular ve danger tonunda açılır', () => {
    const data = deleteConfirm(t, makeTask());

    expect(data.tone).toBe('danger');
    expect(data.confirmLabel).toBe('Sil');
    expect(data.message).toContain('geri alınamaz');
  });

  it('üstlenme penceresi durum geçişini gösterir', () => {
    const data = claimConfirm(t, makeTask({ status: TaskItemStatus.Open }));

    expect(data.details).toBe('Boşta → Devam ediyor');
    expect(data.confirmLabel).toBe('Üstlen');
  });

  describe('atama', () => {
    it('atanmamış işte "ata" der ve havuzdan çıkışı anlatır', () => {
      const data = assignConfirm(t, makeTask(), 'Ayşe Yılmaz adlı kişiye', null);

      expect(data.title).toBe('İş atansın mı?');
      expect(data.confirmLabel).toBe('Ata');
      expect(data.message).toContain('Havuzdan çıkıp');
      expect(data.details).toBe('Boşta → Devam ediyor');
    });

    it('atanmış işte "devret" der ve iki tarafı da yazar', () => {
      const task = makeTask({
        status: TaskItemStatus.Taken,
        assignedUserId: 3,
      });

      const data = assignConfirm(t, task, 'sana', 'Mehmet');

      expect(data.title).toBe('İş devredilsin mi?');
      expect(data.confirmLabel).toBe('Devret');
      expect(data.message).toContain('Mehmet');
      expect(data.message).toContain('sana');
    });

    it('durum değişmiyorsa geçiş satırı göstermez', () => {
      const task = makeTask({
        status: TaskItemStatus.Taken,
        assignedUserId: 3,
      });

      expect(assignConfirm(t, task, 'sana', 'Mehmet').details).toBeUndefined();
    });
  });

  describe('durum değişikliği', () => {
    it('tamamlamada success tonu kullanır', () => {
      const task = makeTask({ status: TaskItemStatus.Taken });
      const data = moveConfirm(t, task, TaskItemStatus.Completed);

      expect(data.tone).toBe('success');
      expect(data.details).toBe('Devam ediyor → Tamamlandı');
    });

    it('havuza döndürmede atamanın kalkacağını söyler', () => {
      const task = makeTask({ status: TaskItemStatus.Taken, assignedUserId: 3 });
      const data = moveConfirm(t, task, TaskItemStatus.Open);

      expect(data.tone).toBe('warning');
      expect(data.message).toContain('atama kaldırılacak');
      expect(data.confirmLabel).toBe('Havuza döndür');
    });

    it('tamamlanmış işi geri almada "yeniden aç" der', () => {
      const task = makeTask({ status: TaskItemStatus.Completed });
      const data = moveConfirm(t, task, TaskItemStatus.Taken);

      expect(data.confirmLabel).toBe('Yeniden aç');
      expect(data.details).toBe('Tamamlandı → Devam ediyor');
    });
  });

  describe('kritik güncelleme eşiği', () => {
    it('kendi üzerindeki devam eden işte onay istemez', () => {
      const task = makeTask({ status: TaskItemStatus.Taken, assignedUserId: 5 });

      expect(isCriticalUpdate(task, false)).toBe(false);
    });

    it('başkasının üzerindeki işte onay ister', () => {
      const task = makeTask({ status: TaskItemStatus.Taken, assignedUserId: 3 });

      expect(isCriticalUpdate(task, true)).toBe(true);
    });

    it('tamamlanmış işte atanan kim olursa olsun onay ister', () => {
      const task = makeTask({ status: TaskItemStatus.Completed });

      expect(isCriticalUpdate(task, false)).toBe(true);
    });

    it('tamamlanmış iş için geçmişe yansıma uyarısı verir', () => {
      const task = makeTask({ status: TaskItemStatus.Completed });

      expect(criticalUpdateConfirm(t, task, 'Ayşe').message).toContain('geçmiş');
    });

    it('başkasının işi için o kişinin adını yazar', () => {
      const task = makeTask({ status: TaskItemStatus.Taken, assignedUserId: 3 });

      expect(criticalUpdateConfirm(t, task, 'Ayşe').message).toContain('Ayşe');
    });
  });
});
