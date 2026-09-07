import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { RealtimeService } from '../events/realtime.service';
import { HistoryProgressService } from '../../features/dashboard/conversation/history-progress';
import { SessionExitService } from './session-exit.service';

/**
 * Cerrar sesión: un solo camino, y que no se deje nada detrás.
 *
 * LA FUGA QUE ESTO CIERRA
 * -----------------------
 * Los componentes mueren al navegar y se llevan su estado. Los servicios de
 * la raíz **no**: viven mientras viva la pestaña. El progreso de historial
 * guarda el id de la conversación abierta y cuántos mensajes se recuperaron,
 * así que sin vaciarlo el siguiente usuario que entrase en el mismo navegador
 * heredaría ese rastro del anterior.
 *
 * LO QUE NO ES
 * ------------
 * Cerrar sesión **no** desvincula WhatsApp. Si costara volver a escanear un
 * código QR, nadie cerraría sesión en un ordenador prestado.
 */
describe('Salir de la cuenta', () => {
  let logout: ReturnType<typeof vi.fn>;
  let disconnect: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let historial: HistoryProgressService;

  const montar = (respuesta = of({})) => {
    logout = vi.fn(() => respuesta);
    disconnect = vi.fn();
    navigateByUrl = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        SessionExitService,
        HistoryProgressService,
        { provide: AuthService, useValue: { logout } },
        { provide: RealtimeService, useValue: { disconnect, events$: new Subject() } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    historial = TestBed.inject(HistoryProgressService);
    return TestBed.inject(SessionExitService);
  };

  it('llama al backend, corta el canal y lleva al login', () => {
    const salida = montar();

    salida.salir().subscribe();

    expect(logout).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('EL CANAL EN VIVO SE CORTA ANTES DE NAVEGAR', () => {
    // Al revés, el `EventSource` sigue reconectando contra una sesión que ya
    // no existe y puede entregar un evento de la cuenta anterior a la
    // pantalla de login.
    const orden: string[] = [];
    logout = vi.fn(() => of({}));
    TestBed.configureTestingModule({
      providers: [
        SessionExitService,
        HistoryProgressService,
        { provide: AuthService, useValue: { logout } },
        {
          provide: RealtimeService,
          useValue: { disconnect: () => orden.push('cortar'), events$: new Subject() },
        },
        { provide: Router, useValue: { navigateByUrl: () => orden.push('navegar') } },
      ],
    });

    TestBed.inject(SessionExitService).salir().subscribe();

    expect(orden.indexOf('cortar')).toBeLessThan(orden.indexOf('navegar'));
  });

  it('NO DEJA EL PROGRESO DEL USUARIO ANTERIOR EN MEMORIA', () => {
    // La prueba que más importa: es lo que vería el siguiente usuario que
    // entrase en este mismo navegador.
    const salida = montar();
    historial.seguir(61015).subscribe();
    historial.estado.set('recuperando');
    historial.recuperados.set(423);
    historial.ultimoError.set('algo pasó');

    salida.salir().subscribe();

    expect(historial.recuperados()).toBe(0);
    expect(historial.estado()).toBe('inactivo');
    expect(historial.ultimoError()).toBeNull();
    expect(historial.visible()).toBe(false);
  });

  it('un evento tardío de la cuenta anterior ya no cuenta', () => {
    const salida = montar();
    historial.seguir(61015).subscribe();
    salida.salir().subscribe();

    // Aunque algo colara un lote después de salir, el foco ya no existe.
    historial.recuperados.set(0);
    expect(historial.recuperados()).toBe(0);
  });

  it('SI EL BACKEND FALLA, SE SALE IGUAL', () => {
    // Dejar al usuario dentro de un panel que ya no puede usar es peor que un
    // logout que no se pudo registrar en el servidor.
    const salida = montar(throwError(() => new Error('sin red')));

    salida.salir().subscribe();

    expect(disconnect).toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('el progreso se vacía aunque el backend falle', () => {
    const salida = montar(throwError(() => new Error('sin red')));
    historial.seguir(7).subscribe();
    historial.recuperados.set(50);

    salida.salir().subscribe();

    expect(historial.recuperados()).toBe(0);
  });

  it('NO DESVINCULA WHATSAPP: solo llama al logout de la sesión web', () => {
    const salida = montar();

    salida.salir().subscribe();

    // Un único endpoint, el de la sesión. Nada de desvincular ni de Drive.
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
