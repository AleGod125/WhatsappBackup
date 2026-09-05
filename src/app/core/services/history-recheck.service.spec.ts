import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HistoryRecheckService,
  normalizeChatRecheck,
  normalizeRecheckJob,
} from './history-recheck.service';

/**
 * La revision de historiales pendientes es la ruta NORMAL del producto.
 *
 * Lo que se fija aqui, sobre todo, es que no toque los endpoints de la sesion
 * auxiliar: esa vincula un segundo dispositivo a la cuenta del usuario y esta
 * apagada en el backend. Si el frontend la llamara, el usuario veria un error
 * confuso donde deberia ver su historial.
 */
describe('HistoryRecheckService', () => {
  let service: HistoryRecheckService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HistoryRecheckService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('el boton global llama a la revision local, no a la auxiliar', () => {
    service.recheckPending().subscribe();
    const peticion = http.expectOne('http://localhost:5000/api/v1/history/recheck-pending');
    expect(peticion.request.method).toBe('POST');
    peticion.flush({ job_id: 'a1', state: 'starting', total: 30 });
  });

  it('la revision automatica se marca como tal', () => {
    // El backend le aplica una espera entre ejecuciones. Sin el parametro no
    // podria distinguirla del boton, y un F5 repetido reinterpretaria los
    // blobs una y otra vez.
    service.recheckPending({ auto: true }).subscribe();
    http.expectOne('http://localhost:5000/api/v1/history/recheck-pending?auto=1').flush({});
  });

  it('el boton del usuario NO lleva la marca automatica', () => {
    service.recheckPending().subscribe();
    http.expectOne('http://localhost:5000/api/v1/history/recheck-pending').flush({});
  });

  it('omitida por la espera no es un fallo', () => {
    const job = normalizeRecheckJob({
      job_id: 'x',
      state: 'completed',
      skipped: true,
      skipped_reason: 'se reviso hace menos de 120s',
    });
    expect(job.skipped).toBe(true);
    expect(job.state).toBe('completed');
    expect(job.errors).toBe(0);
  });

  it('el boton de un chat llama a su recheck, no a recover', () => {
    service.recheckChat(13).subscribe();
    const peticion = http.expectOne('http://localhost:5000/api/v1/chats/13/history/recheck');
    expect(peticion.request.method).toBe('POST');
    peticion.flush({ seed_found: false, status: 'waiting_seed' });
  });

  it('traduce el progreso del trabajo', () => {
    const job = normalizeRecheckJob({
      job_id: 'a1',
      state: 'running',
      total: 30,
      processed: 11,
      recovered: 4,
      still_waiting: 6,
      errors: 1,
      messages_recovered: 12,
      current_chat: { id: 13, name: 'ubernel', state: 'rechecking' },
    });
    expect(job.stillWaiting).toBe(6);
    expect(job.currentChat).toEqual({ id: 13, name: 'ubernel', state: 'rechecking' });
  });

  it('un estado desconocido no rompe la pantalla', () => {
    expect(normalizeRecheckJob({ state: 'algo_nuevo' }).state).toBe('starting');
    expect(normalizeRecheckJob({}).total).toBe(0);
  });

  it('"sin referencia" cuenta como pendiente, no como error', () => {
    const job = normalizeChatRecheck({ seed_found: false, status: 'waiting_seed' });
    expect(job.stillWaiting).toBe(1);
    expect(job.errors).toBe(0);
    expect(job.state).toBe('completed');
  });

  it('"con referencia" cuenta como recuperado', () => {
    const job = normalizeChatRecheck({ seed_found: true, can_dig: true });
    expect(job.recovered).toBe(1);
    expect(job.stillWaiting).toBe(0);
  });
});

/**
 * La frontera: el producto normal no llama a la sesion auxiliar.
 *
 * Con un solo QR tiene que funcionar entero. Si algo volviera a pedir
 * `/history/web-bootstrap/*`, el usuario recibiria un 404 con un motivo que no
 * espera o —peor— se le pediria un segundo codigo.
 *
 * Se comprueba por comportamiento y no leyendo el codigo: `HttpTestingController`
 * falla si sale UNA peticion que no se declare aqui, asi que fija las URLs que
 * el producto usa de verdad.
 */
describe('la ruta normal no usa la sesion auxiliar', () => {
  let service: HistoryRecheckService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HistoryRecheckService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // El cliente de Web Bootstrap se retiró del frontend entero; sus endpoints
  // siguen en el backend tras WEB_BOOTSTRAP_ENABLED, y su código en
  // app/experimental. Lo que se comprueba aquí es que nada del producto los
  // llame: `HttpTestingController` falla si sale una petición no declarada.
  it('ninguna llamada del producto toca /history/web-bootstrap/', () => {
    service.recheckPending().subscribe();
    service.recheckChat(13).subscribe();
    service.status('a1').subscribe();

    for (const peticion of http.match(() => true)) {
      expect(peticion.request.url).not.toContain('web-bootstrap');
      peticion.flush({});
    }
  });

  it('el trabajo se sigue por su propio status, no por el del piloto', () => {
    service.status('a1').subscribe();
    http.expectOne('http://localhost:5000/api/v1/history/recheck-pending/status/a1').flush({});
  });
});
