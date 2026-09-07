import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
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

/**
 * Los cuatro estados del acceso al panel. No hay un quinto.
 *
 * EL FALLO QUE ESTO CIERRA
 * ------------------------
 * Se vio `/dashboard` cargado con un cartel de «vuelve a vincular WhatsApp»
 * dentro. El guard obedecia bien: el que mentia era el backend, que leia una
 * columna guardada en vez del estado vivo. Aqui se fija que, venga como venga
 * el `next_step`, el guard del panel NO deja entrar si no dice `dashboard`.
 */
describe('Acceso al panel: los cuatro estados', () => {
  let onboarding: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onboarding = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { onboarding } }],
    });
  });

  const correr = (guard: typeof dashboardGuard) =>
    TestBed.runInInjectionContext(() => guard({} as never, {} as never));

  const destino = (resultado: unknown) => String((resultado as UrlTree).toString());

  it('A) auth si, google si, whatsapp NO -> /pairing', async () => {
    onboarding.mockReturnValue(
      of(estado({ authenticated: true, driveAuthorized: true, nextStep: 'pairing' })),
    );
    const resultado = await firstValueFrom(correr(dashboardGuard) as never);
    expect(destino(resultado)).toBe('/pairing');
  });

  it('B) auth si, google NO, whatsapp si -> conexion de Google', async () => {
    onboarding.mockReturnValue(
      of(estado({ authenticated: true, whatsappLinked: true, nextStep: 'connect_google' })),
    );
    const resultado = await firstValueFrom(correr(dashboardGuard) as never);
    expect(destino(resultado)).toBe('/connect-google');
  });

  it('C) auth si, google si, whatsapp si -> se permite', async () => {
    onboarding.mockReturnValue(
      of(
        estado({
          authenticated: true,
          driveAuthorized: true,
          whatsappLinked: true,
          nextStep: 'dashboard',
        }),
      ),
    );
    expect(await firstValueFrom(correr(dashboardGuard) as never)).toBe(true);
  });

  it('D) sin autenticar -> login', async () => {
    onboarding.mockReturnValue(of(estado({ nextStep: 'login' })));
    const resultado = await firstValueFrom(correr(dashboardGuard) as never);
    expect(destino(resultado)).toBe('/login');
  });

  it('E) escribir /dashboard a mano sin WhatsApp NO deja entrar', async () => {
    // Es el mismo camino: el guard corre antes de montar nada, venga la
    // navegacion de un enlace o de la barra de direcciones.
    onboarding.mockReturnValue(
      of(estado({ authenticated: true, driveAuthorized: true, nextStep: 'pairing' })),
    );
    const resultado = await firstValueFrom(correr(dashboardGuard) as never);
    expect(resultado).not.toBe(true);
    expect(destino(resultado)).toBe('/pairing');
  });

  it('F) al recargar se vuelve a preguntar al backend', async () => {
    // Nada de recordar un booleano viejo: el guard consulta cada vez.
    onboarding.mockReturnValue(
      of(estado({ authenticated: true, driveAuthorized: true, nextStep: 'pairing' })),
    );
    await firstValueFrom(correr(dashboardGuard) as never);
    await firstValueFrom(correr(dashboardGuard) as never);
    expect(onboarding).toHaveBeenCalledTimes(2);
  });

  it('G) estando en /pairing NO se redirige otra vez a /pairing', async () => {
    // Sin esto seria un bucle infinito de redirecciones.
    onboarding.mockReturnValue(
      of(estado({ authenticated: true, driveAuthorized: true, nextStep: 'pairing' })),
    );
    expect(await firstValueFrom(correr(pairingGuard) as never)).toBe(true);
  });

  it('H) tras vincular, con Google puesto, el panel se abre', async () => {
    onboarding.mockReturnValue(
      of(
        estado({
          authenticated: true,
          driveAuthorized: true,
          whatsappLinked: true,
          nextStep: 'dashboard',
        }),
      ),
    );
    expect(await firstValueFrom(correr(dashboardGuard) as never)).toBe(true);
  });

  it('I) tras vincular, sin Google, se va a Google y no al panel', async () => {
    onboarding.mockReturnValue(
      of(estado({ authenticated: true, whatsappLinked: true, nextStep: 'connect_google' })),
    );
    const resultado = await firstValueFrom(correr(dashboardGuard) as never);
    expect(destino(resultado)).toBe('/connect-google');
  });
});
