import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';

type ToastKind = 'success' | 'error' | 'info';

/**
 * Kısa bildirimler (toast). Material Snackbar'ı sarmalıyor ki bileşenler
 * konum/süre/stil ayarlarını tek tek tekrarlamak zorunda kalmasın.
 */
@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.show(message, 'success', 3000);
  }

  info(message: string): void {
    this.show(message, 'info', 3000);
  }

  /** Hatalar biraz daha uzun kalsın - kullanıcı okumaya fırsat bulsun. */
  error(message: string): void {
    this.show(message, 'error', 5000);
  }

  private show(message: string, kind: ToastKind, duration: number): void {
    const config: MatSnackBarConfig = {
      duration,
      horizontalPosition: 'right',
      verticalPosition: 'bottom',
      panelClass: [`toast--${kind}`],
    };

    this.snackBar.open(message, 'Kapat', config);
  }
}
