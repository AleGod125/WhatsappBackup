import { environment } from '../../../environments/environment';

/**
 * Frontend y backend tienen que estar en el MISMO host.
 *
 * Es la causa exacta del bug: la cookie de sesión se creaba en
 * `127.0.0.1:5000` y el frontend, servido desde `localhost:4200`, hacía sus
 * peticiones a `127.0.0.1:5000`. Para el navegador **`localhost` y
 * `127.0.0.1` son sitios distintos**, así que una cookie `SameSite=Lax`
 * puesta en uno NO viaja en las peticiones que hace el otro.
 *
 * Efecto: Google terminaba bien, el backend creaba la sesión, y el
 * `/onboarding/status` siguiente llegaba sin cookie → `authenticated=false`
 * → vuelta a /login.
 *
 * La alternativa —bajar a `SameSite=None`— haría que la cookie viajara en
 * peticiones que origine cualquier sitio. Eso no se arregla, se empeora.
 */
describe('host de la API', () => {
  it('usa localhost, no 127.0.0.1', () => {
    expect(environment.apiBaseUrl).toContain('localhost');
    expect(environment.apiBaseUrl).not.toContain('127.0.0.1');
  });

  it('coincide con el host del frontend en desarrollo', () => {
    // ng serve sirve en localhost:4200. Mismo host = mismo sitio, y una
    // cookie Lax sí viaja entre puertos del mismo host.
    const host = new URL(environment.apiBaseUrl).hostname;
    expect(host).toBe('localhost');
  });
});
