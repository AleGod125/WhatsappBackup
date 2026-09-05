import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { RealtimeService } from './realtime.service';

/**
 * El stream de eventos tiene que ir autenticado.
 *
 * EL FALLO QUE ESTO FIJA
 * ----------------------
 * `EventSource` **no pasa por el interceptor de HttpClient**, así que la
 * configuración de `withCredentials` del resto de la app no le aplica. Se
 * abría sin credenciales, la cookie de sesión no viajaba, el backend
 * respondía 401 y el frontend no se enteraba de nada.
 *
 * Efecto visible: WhatsApp se vinculaba bien —`CONNECTED`, History Sync en
 * marcha— y la pantalla se quedaba en "Abriendo tus conversaciones…" para
 * siempre.
 */
describe('stream de eventos', () => {
  let creadas: Array<{ url: string; init?: EventSourceInit }>;
  const Original = globalThis.EventSource;

  beforeEach(() => {
    creadas = [];
    class Espia {
      withCredentials: boolean;
      onopen: unknown = null;
      onerror: unknown = null;
      onmessage: unknown = null;
      constructor(
        public url: string,
        public init?: EventSourceInit,
      ) {
        creadas.push({ url, init });
        this.withCredentials = init?.withCredentials ?? false;
      }
      addEventListener() {}
      close() {}
    }
    globalThis.EventSource = Espia as unknown as typeof EventSource;
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    globalThis.EventSource = Original;
  });

  it('se abre con credenciales', () => {
    TestBed.inject(RealtimeService).connect();

    expect(creadas).toHaveLength(1);
    expect(creadas[0].init?.withCredentials).toBe(true);
  });

  it('usa la URL central, en localhost', () => {
    TestBed.inject(RealtimeService).connect();

    expect(creadas[0].url).toBe(`${environment.apiBaseUrl}/events/stream`);
    expect(creadas[0].url).toContain('localhost');
    expect(creadas[0].url).not.toContain('127.0.0.1');
  });

  it('nunca abre una segunda conexión', () => {
    // `EventSource` ya reconecta solo. Abrir otra en cada error acabaría con
    // veinte streams contra el mismo backend.
    const servicio = TestBed.inject(RealtimeService);
    servicio.connect();
    servicio.connect();
    servicio.connect();

    expect(creadas).toHaveLength(1);
  });

  it('tras cerrar se puede volver a abrir, pero solo una', () => {
    const servicio = TestBed.inject(RealtimeService);
    servicio.connect();
    servicio.disconnect();
    servicio.connect();
    servicio.connect();

    expect(creadas).toHaveLength(2);
  });

  it('no busca ningún token: la sesión va en la cookie', () => {
    // Un token en localStorage sería legible desde la consola del navegador.
    localStorage.setItem('token', 'NO-DEBERIA-USARSE');
    TestBed.inject(RealtimeService).connect();

    expect(creadas[0].url).not.toContain('NO-DEBERIA-USARSE');
    expect(creadas[0].url).not.toContain('token');
    localStorage.clear();
  });
});
