import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

/**
 * Onay penceresi açmanın tek yolu.
 *
 * Pencere ayarları (genişlik, odak, kapanış davranışı) burada tek yerde
 * duruyor; çağıran taraf yalnızca metinleri veriyor.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(MatDialog);

  /**
   * Kullanıcı onaylarsa `true`. Vazgeç, Escape ve dışarı tıklama `false`
   * döner - yani "onaylanmadı" varsayılan sonuç.
   */
  async ask(data: ConfirmDialogData): Promise<boolean> {
    const dialogRef = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data,
        width: '420px',
        maxWidth: 'calc(100vw - 32px)',
        // Odak butona değil pencerenin kendisine gidiyor: Enter'a basılı kalan
        // kullanıcı yıkıcı bir işlemi kazara onaylamasın.
        autoFocus: 'dialog',
        restoreFocus: true,
      },
    );

    return (await firstValueFrom(dialogRef.afterClosed())) === true;
  }
}
