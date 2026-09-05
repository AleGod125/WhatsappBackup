import { Routes } from '@angular/router';
import {
  connectGoogleGuard,
  dashboardGuard,
  invitadoGuard,
  pairingGuard,
} from './core/guards/onboarding.guard';

/**
 * El orden de la ruta NO decide nada: cada guard pregunta al backend por
 * `/onboarding/status`. Escribir `/dashboard` a mano no salta ningún paso.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [invitadoGuard],
    loadComponent: () =>
      import('./features/auth/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'register',
    canActivate: [invitadoGuard],
    loadComponent: () =>
      import('./features/auth/register-page.component').then((m) => m.RegisterPageComponent),
  },
  {
    path: 'connect-google',
    canActivate: [connectGoogleGuard],
    loadComponent: () =>
      import('./features/auth/connect-google-page.component').then(
        (m) => m.ConnectGooglePageComponent,
      ),
  },
  {
    // Vuelta del OAuth. Sin guard a propósito: es quien AVERIGUA el estado
    // recién cambiado, así que no puede exigir conocerlo de antemano.
    path: 'auth/google/callback',
    loadComponent: () =>
      import('./features/auth/google-callback-page.component').then(
        (m) => m.GoogleCallbackPageComponent,
      ),
  },
  {
    path: 'pairing',
    canActivate: [pairingGuard],
    loadComponent: () =>
      import('./features/pairing/pairing-page.component').then((m) => m.PairingPageComponent),
  },
  {
    path: 'dashboard',
    canActivate: [dashboardGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard-page.component').then((m) => m.DashboardPageComponent),
  },
  {
    path: 'dashboard/:chatId',
    canActivate: [dashboardGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard-page.component').then((m) => m.DashboardPageComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
