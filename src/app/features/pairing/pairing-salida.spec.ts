import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { RealtimeService } from '../../core/events/realtime.service';
import { SessionService } from '../../core/services/session.service';
import { PairingPageComponent } from './pairing-page.component';

/**
 * Salir de la pantalla de vinculación.
 *
 * EL FALLO QUE ESTO ARREGLA
 * -------------------------
 * El backend vinculaba bien —`pair-success`, `CONNECTED`, History Sync en
 * marcha— y la pantalla se quedaba en "Abriendo tus conversaciones…" para
 * siempre.
 *
 * Dos causas encadenadas:
 *
 * 1. El SSE se abría sin `withCredentials`, así que la cookie de sesión no
 *    viajaba y el backend respondía 401. El frontend nunca se enteraba de que
 *    la sesión había conectado.
 * 2. No había respaldo: sin ese evento, nada más sacaba de ahí.
 *
 * Por eso el respaldo importa tanto como el arreglo: un evento se pierde si
 * el navegador durmió, si el stream reconectó, o si llegó antes de que el
 * componente se suscribiera.
 */

const BASE = 'http://localhost:5000/api/v1';

function onboarding(parcial: Record<string, unknown> = {}) {
  return {
    authenticated: true,
    google_connected: true,
    drive_authorized: true,
    whatsapp_linked: false,
    next_step: 'pairing',
    ...parcial,
  };
}

function montar() {
  const eventos = new Subject<{ type: string; data: unknown }>();
  const session = {
    getSession: () => new Subject(),
    pair: () => new Subject(),
    qr: () => new Subject(),
    qrImageUrl: (g: number) => `${BASE}/session/qr/image?generation=${g}`,
  };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: SessionService, useValue: session },
      {
        provide: RealtimeService,
        useValue: { connect: () => undefined, events$: eventos.asObservable() },
      },
    ],
  });

  const router = TestBed.inject(Router);
  const navegar = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(PairingPageComponent);
  fixture.detectChanges();

  return { fixture, http, navegar, eventos };
}

describe('salida de la pantalla de vinculación', () => {
  afterEach(() => vi.useRealTimers());

  it('si ya está vinculado NO pide otra vinculación y va al panel', () => {
    // Recargar /pairing con la cuenta ya vinculada no puede intentar arrancar
    // una sesión sobre una que funciona.
    const { http, navegar, fixture } = montar();

    http
      .expectOne(`${BASE}/onboarding/status`)
      .flush(onboarding({ whatsapp_linked: true, next_step: 'dashboard' }));

    expect(navegar).toHaveBeenCalledWith('/dashboard');
    http.expectNone(`${BASE}/session/pair`);
    http.expectNone(`${BASE}/session/qr`);
    fixture.destroy();
  });

  it('sin sesión va al formulario de acceso', () => {
    const { http, navegar, fixture } = montar();
    http
      .expectOne(`${BASE}/onboarding/status`)
      .flush(onboarding({ authenticated: false, next_step: 'login' }));

    expect(navegar).toHaveBeenCalledWith('/login');
    fixture.destroy();
  });

  it('sin Drive va a conectar Google', () => {
    const { http, navegar, fixture } = montar();
    http
      .expectOne(`${BASE}/onboarding/status`)
      .flush(onboarding({ drive_authorized: false, next_step: 'connect_google' }));

    expect(navegar).toHaveBeenCalledWith('/connect-google');
    fixture.destroy();
  });

  it('si aún no está vinculado se queda y arranca la vinculación', () => {
    const { http, navegar, fixture } = montar();
    http.expectOne(`${BASE}/onboarding/status`).flush(onboarding());

    expect(navegar).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('el sondeo saca de aquí aunque se pierda el evento SSE', () => {
    // El caso real: el evento no llegó nunca porque el stream daba 401.
    vi.useFakeTimers();
    const { http, navegar, fixture } = montar();
    http.expectOne(`${BASE}/onboarding/status`).flush(onboarding());
    expect(navegar).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2500);
    http
      .expectOne(`${BASE}/onboarding/status`)
      .flush(onboarding({ whatsapp_linked: true, next_step: 'dashboard' }));

    expect(navegar).toHaveBeenCalledWith('/dashboard');
    fixture.destroy();
  });

  it('no navega dos veces si el evento y el sondeo coinciden', () => {
    vi.useFakeTimers();
    const { http, navegar, fixture } = montar();
    http.expectOne(`${BASE}/onboarding/status`).flush(onboarding());

    for (const _ of [0, 1]) {
      vi.advanceTimersByTime(2500);
      for (const p of http.match(`${BASE}/onboarding/status`)) {
        p.flush(onboarding({ whatsapp_linked: true, next_step: 'dashboard' }));
      }
    }
    expect(navegar).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('al destruir el componente el sondeo se detiene', () => {
    // Un intervalo colgado seguiría pidiendo al backend desde una pantalla
    // que ya no existe.
    vi.useFakeTimers();
    const { http, fixture } = montar();
    http.expectOne(`${BASE}/onboarding/status`).flush(onboarding());

    fixture.destroy();
    vi.advanceTimersByTime(10000);
    http.expectNone(`${BASE}/onboarding/status`);
  });

  it('un fallo al preguntar no deja la pantalla en blanco', () => {
    const { http, navegar, fixture } = montar();
    http
      .expectOne(`${BASE}/onboarding/status`)
      .flush({}, { status: 500, statusText: 'Server Error' });

    // Se sigue con el camino normal: intentarlo es mejor que quedarse parado.
    expect(navegar).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
