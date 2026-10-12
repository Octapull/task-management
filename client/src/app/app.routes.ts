import { inject } from '@angular/core';
import { ResolveFn, Routes } from '@angular/router';

import { authGuard, guestGuard, pendingVerificationGuard } from './core/guards/auth.guard';
import { I18nService } from './core/i18n/i18n.service';
import { MessageKey } from './core/i18n/messages';

/** Ürün adı çevrilmiyor: marka olarak her dilde aynı kalıyor. */
const APP_NAME = 'İş Takip';

/**
 * Sekme başlığı. Statik metin yerine çözümleyici kullanılıyor ki başlık da
 * seçili dile göre gelsin; yönlendirme her gerçekleştiğinde yeniden çözülür.
 */
function title(key: MessageKey): ResolveFn<string> {
  return () => `${inject(I18nService).t(key)} · ${APP_NAME}`;
}

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: title('login.submit'),
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    title: title('login.forgot'),
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent,
      ),
  },
  {
    path: 'reset-password',
    canActivate: [guestGuard],
    title: title('reset.title'),
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.component').then(
        (m) => m.ResetPasswordComponent,
      ),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    title: title('login.register'),
    loadComponent: () =>
      import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'verify',
    canActivate: [pendingVerificationGuard],
    title: title('verify.title'),
    loadComponent: () =>
      import('./features/auth/verify/verify.component').then((m) => m.VerifyComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: 'board',
        title: title('nav.board'),
        loadComponent: () =>
          import('./features/dashboard/board/board.component').then((m) => m.BoardComponent),
      },
      {
        path: 'list',
        title: title('nav.list'),
        loadComponent: () =>
          import('./features/dashboard/task-list/task-list.component').then(
            (m) => m.TaskListComponent,
          ),
      },
      {
        path: 'task/:id',
        title: title('route.taskDetail'),
        loadComponent: () =>
          import('./features/task-detail/task-detail.component').then((m) => m.TaskDetailComponent),
      },
      {
        path: 'activity',
        title: title('activity.title'),
        loadComponent: () =>
          import('./features/activity/activity.component').then((m) => m.ActivityComponent),
      },
      {
        path: 'team',
        title: title('team.title'),
        loadComponent: () => import('./features/team/team.component').then((m) => m.TeamComponent),
      },
      {
        path: 'profile',
        title: title('profile.title'),
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
      { path: '', redirectTo: 'board', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
