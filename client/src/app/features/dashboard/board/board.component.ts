import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

import { I18nService } from '../../../core/i18n/i18n.service';
import { MessageKey } from '../../../core/i18n/messages';
import { TaskItem, TaskItemStatus } from '../../../core/models/task.model';
import { TaskStore } from '../../../core/services/task.store';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { IconName } from '../../../shared/ui/icon/icon.constants';
import { TaskActionsService } from '../task-actions.service';
import { TaskCardComponent } from '../task-card/task-card.component';

interface ColumnDefinition {
  status: TaskItemStatus;
  /** Başlık ve boş metni anahtar olarak duruyor; dil değişince yeniden çözülür. */
  titleKey: MessageKey;
  icon: IconName;
  emptyKey: MessageKey;
}

/**
 * Kanban panosu.
 *
 * Sürükle-bırak sadece kolonlar arasında anlamlı: kolon içi sıralama backend'de
 * saklanmadığı için kapatıldı (yenilendiğinde eski sıraya dönmesi kafa
 * karıştırıcı olurdu). Sıralama önceliğe ve teslim tarihine göre otomatik.
 */
@Component({
  selector: 'app-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    MatTooltipModule,
    IconComponent,
    TaskCardComponent,
  ],
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss',
})
export class BoardComponent {
  private readonly actions = inject(TaskActionsService);
  protected readonly store = inject(TaskStore);
  protected readonly i18n = inject(I18nService);

  protected readonly columnDefinitions: readonly ColumnDefinition[] = [
    {
      status: TaskItemStatus.Open,
      titleKey: 'board.column.open',
      icon: 'inbox',
      emptyKey: 'board.column.openEmpty',
    },
    {
      status: TaskItemStatus.Taken,
      titleKey: 'board.column.taken',
      icon: 'clock',
      emptyKey: 'board.column.takenEmpty',
    },
    {
      status: TaskItemStatus.Completed,
      titleKey: 'board.column.completed',
      icon: 'circle-check',
      emptyKey: 'board.column.completedEmpty',
    },
  ];

  /** İskelet ekranı için sabit uzunlukta bir dizi. */
  protected readonly skeletonRows = [0, 1, 2];

  /**
   * Ekipte hiç iş yok - pano ilk kez açılıyor.
   *
   * Üç boş sütun göstermek yerine tek bir karşılama ekranı çıkıyor: yeni
   * kullanıcının ilk adımı "iş oluştur" ve o buton ekranın ortasında.
   */
  protected readonly isBoardEmpty = computed(
    () => this.store.loaded() && this.store.tasks().length === 0,
  );

  /**
   * İş var ama arama/filtre hepsini eliyor.
   *
   * "Hiç işin yok" demek yanıltıcı olurdu; burada yapılacak şey farklı -
   * filtreyi temizlemek.
   */
  protected readonly isFilteredEmpty = computed(() => {
    if (!this.store.loaded() || this.store.tasks().length === 0) return false;

    const columns = this.store.columns();

    return this.columnDefinitions.every((column) => columns[column.status].length === 0);
  });

  /** Boş sonuç ekranındaki "filtreleri temizle" butonu. */
  protected clearFilters(): void {
    this.store.search.set('');
    this.store.quickFilter.set('all');
  }

  /** Onayı beklenen kart - açık pencere sırasında soluk gösteriliyor. */
  protected readonly pendingMoveId = signal<number | null>(null);

  protected readonly Status = TaskItemStatus;

  /**
   * Kart başka bir kolona bırakıldı.
   *
   * Onay penceresi açılırken CDK kartı kendi yerine geri götürüyor: pano
   * `store.columns()` üzerinden çiziliyor ve veri değişmedikçe hiçbir kart
   * yer değiştirmiyor. Yani "Vazgeç" halinde ayrıca geri alma yapmaya gerek
   * yok - kart hiç taşınmamış oluyor, pano durumu bozulmuyor.
   */
  protected async onDrop(event: CdkDragDrop<TaskItemStatus>): Promise<void> {
    // Aynı kolona bırakma: sıralama saklanmadığı için yapacak bir şey yok.
    if (event.previousContainer === event.container) return;

    const task = event.item.data as TaskItem;
    this.pendingMoveId.set(task.id);

    try {
      await this.actions.moveTo(task, event.container.data);
    } finally {
      this.pendingMoveId.set(null);
    }
  }

  protected openCreateDialog(): void {
    this.actions.openCreateDialog();
  }
}
