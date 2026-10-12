import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'tms.theme';

/**
 * Açık/koyu tema.
 *
 * Tema, <html> üzerindeki data-theme özniteliğiyle uygulanıyor; tüm renkler
 * CSS değişkeni olduğu için değişim anında tüm arayüze yansıyor.
 * İlk değer index.html'deki küçük script tarafından, Angular yüklenmeden
 * önce yazılıyor - burada sadece o değeri okuyoruz.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(readCurrentTheme());

  toggle(): void {
    this.apply(this.theme() === 'dark' ? 'light' : 'dark');
  }

  apply(theme: Theme): void {
    this.theme.set(theme);
    document.documentElement.dataset['theme'] = theme;

    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Gizli sekmede localStorage yazılamayabilir; tema yine de uygulanır.
    }
  }
}

function readCurrentTheme(): Theme {
  return document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light';
}
