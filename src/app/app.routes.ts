import { Routes } from '@angular/router';
import { sessionGuard } from './core/guards/session.guard';

export const routes: Routes = [
  {
    path: 'pairing',
    loadComponent: () =>
      import('./features/pairing/pairing-page.component').then((m) => m.PairingPageComponent),
  },
  {
    path: 'dashboard',
    canActivate: [sessionGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard-page.component').then((m) => m.DashboardPageComponent),
  },
  {
    path: 'dashboard/:chatId',
    canActivate: [sessionGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard-page.component').then((m) => m.DashboardPageComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
