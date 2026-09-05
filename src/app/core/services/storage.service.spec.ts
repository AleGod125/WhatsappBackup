import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { StorageService, normalizeStorage } from './storage.service';

/**
 * Angular no sabe que detrás hay Google Drive.
 *
 * Pide un estado y recibe "al día / sincronizando / hay que reconectar".
 * Ningún identificador de archivo, ningún token y ningún enlace de Google
 * pueden cruzar esta frontera: si los cruzaran, bastaría abrir la consola del
 * navegador para sacarlos.
 */
describe('StorageService', () => {
  let service: StorageService;
  let http: HttpTestingController;
  const BASE = 'http://localhost:5000/api/v1';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StorageService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('consulta el estado por el backend, no a Google', () => {
    service.status().subscribe();
    const peticion = http.expectOne(`${BASE}/storage/status`);

    expect(peticion.request.url).not.toContain('googleapis');
    peticion.flush({ enabled: true, state: 'up_to_date' });
  });

  it('preparar el almacenamiento es idempotente desde el cliente', () => {
    service.setup().subscribe((r) => expect(r.rootReady).toBe(true));
    http.expectOne(`${BASE}/storage/setup`).flush({ root_ready: true });
  });

  it('nunca recibe identificadores de archivo de Drive', () => {
    let visto: unknown;
    service.status().subscribe((v) => (visto = v));
    http.expectOne(`${BASE}/storage/status`).flush({
      enabled: true,
      state: 'up_to_date',
      root_folder_id: 'NO-DEBERIA-LLEGAR',
      drive_file_id: 'TAMPOCO',
    });

    const texto = JSON.stringify(visto);
    expect(texto).not.toContain('NO-DEBERIA-LLEGAR');
    expect(texto).not.toContain('TAMPOCO');
  });
});

describe('estado del almacenamiento', () => {
  it('traduce los estados conocidos', () => {
    for (const estado of ['up_to_date', 'syncing', 'paused', 'blocked', 'disabled']) {
      expect(normalizeStorage({ state: estado }).state).toBe(estado);
    }
  });

  it('un estado desconocido NO se pinta como "al día"', () => {
    // Decir "al día" cuando no se sabe afirmaría que todo está guardado.
    expect(normalizeStorage({ state: 'algo_nuevo' }).state).toBe('error');
    expect(normalizeStorage({}).state).toBe('error');
  });

  it('los contadores ausentes valen cero, no NaN', () => {
    const s = normalizeStorage({ state: 'syncing' });
    expect(s.pendingJobs).toBe(0);
    expect(s.bytesUploaded).toBe(0);
  });

  it('distingue "necesita reconectarse" de "hay errores"', () => {
    // Van a sitios distintos: una pide una acción del usuario, la otra se
    // reintenta sola.
    expect(normalizeStorage({ state: 'reauthorization_required' }).state).toBe(
      'reauthorization_required',
    );
    expect(normalizeStorage({ state: 'error' }).state).toBe('error');
  });
});
