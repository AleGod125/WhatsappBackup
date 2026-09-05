import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import {
  connectGoogleGuard,
  dashboardGuard,
  invitadoGuard,
  pairingGuard,
  rutaPara,
} from './onboarding.guard';
import { OnboardingStatus } from '../models/api.models';

/**
 * Los guards obedecen al backend; no deciden.
 *
 * La regla vive en `/onboarding/status`. Si se duplicara aquí, saltársela
 * sería cuestión de escribir otra URL en la barra de direcciones.
 */
function estado(parcial: Partial<OnboardingStatus>): OnboardingStatus {
  return {
    authenticated: false,
    googleConnected: false,
    driveAuthorized: false,
    whatsappLinked: false,
    nextStep: 'login',
    ...parcial,
  };
}

function ejecutar(guard: typeof dashboardGuard, respuesta: unknown) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          onboarding: () =>
            respuesta instanceof Error ? throwError(() => respuesta) : of(respuesta),
        },
      },
    ],
  });
  return TestBed.runInInjectionContext(() => guard(null as never, null as never)) as unknown;
}

async function destino(resultado: unknown): Promise<string | true> {
  const valor = await new Promise<unknown>((resolve) => {
    (resultado as { subscribe: (fn: (v: unknown) => void) => void }).subscribe(resolve);
  });
  return valor === true ? true : String(valor as UrlTree);
}

describe('guards de onboarding', () => {
  it('sin sesión, el panel manda al login', async () => {
    const r = ejecutar(dashboardGuard, estado({ nextStep: 'login' }));
    expect(await destino(r)).toBe('/login');
  });

  it('autenticado sin Drive, el panel manda a conectar Google', async () => {
    // Es el requisito del producto: sin almacenamiento no hay panel.
    const r = ejecutar(dashboardGuard, estado({ authenticated: true, nextStep: 'connect_google' }));
    expect(await destino(r)).toBe('/connect-google');
  });

  it('con Drive pero sin WhatsApp, el panel manda al QR', async () => {
    const r = ejecutar(
      dashboardGuard,
      estado({ authenticated: true, driveAuthorized: true, nextStep: 'pairing' }),
    );
    expect(await destino(r)).toBe('/pairing');
  });

  it('con todo listo, el panel deja pasar', async () => {
    const r = ejecutar(
      dashboardGuard,
      estado({
        authenticated: true,
        driveAuthorized: true,
        whatsappLinked: true,
        nextStep: 'dashboard',
      }),
    );
    expect(await destino(r)).toBe(true);
  });

  it('el QR no se muestra si aún falta conectar Google', async () => {
    const r = ejecutar(pairingGuard, estado({ authenticated: true, nextStep: 'connect_google' }));
    expect(await destino(r)).toBe('/connect-google');
  });

  it('conectar Google no se muestra si ya está conectado', async () => {
    const r = ejecutar(
      connectGoogleGuard,
      estado({ authenticated: true, driveAuthorized: true, nextStep: 'pairing' }),
    );
    expect(await destino(r)).toBe('/pairing');
  });

  it('el login no se muestra a quien ya entró', async () => {
    const r = ejecutar(
      invitadoGuard,
      estado({
        authenticated: true,
        driveAuthorized: true,
        whatsappLinked: true,
        nextStep: 'dashboard',
      }),
    );
    expect(await destino(r)).toBe('/dashboard');
  });

  it('el login sí se muestra a quien no ha entrado', async () => {
    const r = ejecutar(invitadoGuard, estado({ nextStep: 'login' }));
    expect(await destino(r)).toBe(true);
  });

  it('sin backend, el panel manda al login', async () => {
    // Sin poder preguntar no se puede saber nada: al único destino que
    // siempre existe y desde el que se puede recuperar.
    const r = ejecutar(dashboardGuard, new Error('offline'));
    expect(String(await destino(r))).toContain('/login');
  });

  it('sin backend, el formulario de acceso sí se deja ver', async () => {
    // Intentarlo y ver el error es mejor que una pantalla en blanco.
    const r = ejecutar(invitadoGuard, new Error('offline'));
    expect(await destino(r)).toBe(true);
  });

  it('cada paso tiene una ruta', () => {
    expect(rutaPara('login')).toBe('/login');
    expect(rutaPara('connect_google')).toBe('/connect-google');
    expect(rutaPara('pairing')).toBe('/pairing');
    expect(rutaPara('dashboard')).toBe('/dashboard');
  });
});
