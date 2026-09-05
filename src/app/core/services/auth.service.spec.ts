import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { AuthService, normalizeGoogleStatus, normalizeOnboarding } from './auth.service';

/**
 * La identidad NO vive en el navegador.
 *
 * Guardarla en `localStorage` la convertiría en un dato editable desde la
 * consola: cualquiera podría declararse otro usuario. La verdad está en una
 * cookie `HttpOnly` que este código no puede leer, y se pregunta al servidor.
 */
describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;
  const BASE = 'http://localhost:5000/api/v1';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => http.verify());

  it('las peticiones envían la cookie de sesión', () => {
    // Sin `withCredentials` el navegador no manda la cookie entre orígenes
    // (:4200 -> :5000) y TODO respondería 401.
    service.me().subscribe();
    expect(http.expectOne(`${BASE}/auth/me`).request.withCredentials).toBe(true);
  });

  it('las escrituras llevan el token CSRF de la cookie', () => {
    document.cookie = 'whatsapp_backup_csrf=abc123';
    service.login('a@b.com', 'una contrasena larga').subscribe();

    const peticion = http.expectOne(`${BASE}/auth/login`);
    expect(peticion.request.headers.get('X-CSRF-Token')).toBe('abc123');
    peticion.flush({ user: { id: '1', email: 'a@b.com' } });
  });

  it('un login correcto deja al usuario en memoria', () => {
    service.login('a@b.com', 'una contrasena larga').subscribe();
    http.expectOne(`${BASE}/auth/login`).flush({ user: { id: '1', email: 'a@b.com' } });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()?.email).toBe('a@b.com');
  });

  it('nada se guarda en localStorage', () => {
    service.login('a@b.com', 'una contrasena larga').subscribe();
    http.expectOne(`${BASE}/auth/login`).flush({ user: { id: '1', email: 'a@b.com' } });

    expect(localStorage.length).toBe(0);
  });

  it('un 401 en /auth/me significa "nadie", no un error', () => {
    service.me().subscribe({ error: () => undefined });
    http
      .expectOne(`${BASE}/auth/me`)
      .flush(
        { error: { code: 'NOT_AUTHENTICATED', message: 'x' } },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(service.isAuthenticated()).toBe(false);
    expect(service.checked()).toBe(true);
  });

  it('el logout olvida al usuario', () => {
    service.login('a@b.com', 'una contrasena larga').subscribe();
    http.expectOne(`${BASE}/auth/login`).flush({ user: { id: '1', email: 'a@b.com' } });

    service.logout().subscribe();
    http.expectOne(`${BASE}/auth/logout`).flush({ ok: true });

    expect(service.isAuthenticated()).toBe(false);
  });

  it('el registro manda display_name con el nombre del backend', () => {
    service.register('a@b.com', 'una contrasena larga', 'Ana').subscribe();
    const peticion = http.expectOne(`${BASE}/auth/register`);

    expect(peticion.request.body).toEqual({
      email: 'a@b.com',
      password: 'una contrasena larga',
      display_name: 'Ana',
    });
    peticion.flush({ user: { id: '1', email: 'a@b.com' } });
  });

  it('ninguna petición lleva un user_id', () => {
    // El backend lo saca de la cookie. Si el cliente pudiera decir quién es,
    // cambiarlo sería todo lo que hace falta para leer datos ajenos.
    service.onboarding().subscribe();
    const peticion = http.expectOne(`${BASE}/onboarding/status`);

    expect(peticion.request.urlWithParams).not.toContain('user_id');
    peticion.flush({});
  });
});

describe('estado de onboarding', () => {
  it('traduce los cuatro pasos', () => {
    for (const paso of ['login', 'connect_google', 'pairing', 'dashboard']) {
      expect(normalizeOnboarding({ next_step: paso }).nextStep).toBe(paso);
    }
  });

  it('un paso desconocido manda al login', () => {
    // Es el único destino que siempre existe y del que se puede salir.
    expect(normalizeOnboarding({ next_step: 'algo_raro' }).nextStep).toBe('login');
    expect(normalizeOnboarding({}).nextStep).toBe('login');
  });

  it('identidad conectada y Drive autorizado son cosas distintas', () => {
    // Google puede dar una y negar la otra: darlo por bueno prometería un
    // almacenamiento que no existe.
    const estado = normalizeGoogleStatus({
      google_connected: true,
      drive_authorized: false,
      token_valid: true,
      scopes: ['openid', 'email'],
    });
    expect(estado.googleConnected).toBe(true);
    expect(estado.driveAuthorized).toBe(false);
  });

  it('el estado nunca trae tokens', () => {
    const estado = normalizeGoogleStatus({
      google_connected: true,
      drive_authorized: true,
      access_token: 'ya29.no-deberia-estar',
      refresh_token: '1//tampoco',
    });
    expect(JSON.stringify(estado)).not.toContain('ya29');
    expect(JSON.stringify(estado)).not.toContain('1//');
  });
});
