import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ApiClientService } from '../api/api-client.service';
import { AuthUser, GoogleStatus, OnboardingStatus } from '../models/api.models';

/**
 * Quién ha iniciado sesión.
 *
 * La identidad NO se guarda en `localStorage`: ahí sería un dato que
 * cualquiera puede editar desde la consola del navegador, y el frontend
 * acabaría "creyendo" ser alguien que no es. La verdad vive en una cookie
 * `HttpOnly` que este código no puede leer, y se pregunta al servidor.
 *
 * Las señales de aquí son solo estado de interfaz: sirven para no repintar,
 * nunca para decidir si algo se permite. Eso lo decide el backend.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiClientService);

  private readonly _user = signal<AuthUser | undefined>(undefined);
  private readonly _checked = signal(false);

  readonly user = this._user.asReadonly();
  /** `false` mientras no se ha preguntado: distinto de "no hay sesión". */
  readonly checked = this._checked.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== undefined);

  /** Pregunta al servidor quién soy. Un 401 significa "nadie", no un error. */
  me(): Observable<AuthUser | undefined> {
    return this.api.get<{ user: AuthUser }>('/auth/me').pipe(
      map((cuerpo) => cuerpo.user),
      tap({
        next: (usuario) => {
          this._user.set(usuario);
          this._checked.set(true);
        },
        error: () => {
          this._user.set(undefined);
          this._checked.set(true);
        },
      }),
    );
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.api.post<{ user: AuthUser }>('/auth/login', { email, password }).pipe(
      map((cuerpo) => cuerpo.user),
      tap((usuario) => {
        this._user.set(usuario);
        this._checked.set(true);
      }),
    );
  }

  register(email: string, password: string, displayName?: string): Observable<AuthUser> {
    return this.api
      .post<{ user: AuthUser }>('/auth/register', {
        email,
        password,
        display_name: displayName,
      })
      .pipe(
        map((cuerpo) => cuerpo.user),
        tap((usuario) => {
          this._user.set(usuario);
          this._checked.set(true);
        }),
      );
  }

  /**
   * Cierra la sesión web. NO desvincula WhatsApp ni desconecta Google: son
   * acciones distintas, y mezclarlas haría que cerrar sesión en un ordenador
   * prestado costara volver a escanear un QR.
   */
  logout(): Observable<unknown> {
    return this.api.post('/auth/logout').pipe(
      tap(() => {
        this._user.set(undefined);
        this._checked.set(true);
      }),
    );
  }

  /**
   * Por dónde va el usuario. **El backend decide**, el frontend obedece.
   *
   * Si las reglas se duplicaran aquí, saltárselas sería cuestión de escribir
   * otra URL en la barra de direcciones.
   */
  onboarding(): Observable<OnboardingStatus> {
    return this.api
      .get<Record<string, unknown>>('/onboarding/status')
      .pipe(map(normalizeOnboarding));
  }

  googleStatus(): Observable<GoogleStatus> {
    return this.api
      .get<Record<string, unknown>>('/auth/google/status')
      .pipe(map(normalizeGoogleStatus));
  }

  /** Comprueba de verdad que Drive responde, con una llamada real. */
  verifyDrive(): Observable<{ driveOk: boolean; reason?: string }> {
    return this.api.post<Record<string, unknown>>('/auth/google/verify').pipe(
      map((raw) => ({
        driveOk: raw['drive_ok'] === true,
        reason: typeof raw['reason'] === 'string' ? raw['reason'] : undefined,
      })),
    );
  }

  disconnectGoogle(): Observable<unknown> {
    return this.api.post('/auth/google/disconnect');
  }

  /**
   * Manda al navegador a Google.
   *
   * Es una redirección de página completa, no una llamada XHR: el flujo de
   * OAuth ocurre entre el navegador y Google, y el `client_secret` nunca sale
   * del backend.
   */
  startGoogle(): void {
    window.location.href = this.api.url('/auth/google/start');
  }
}

export function normalizeOnboarding(raw: Record<string, unknown>): OnboardingStatus {
  const paso = String(raw['next_step'] ?? 'login');
  const pasos = ['login', 'connect_google', 'pairing', 'dashboard'] as const;
  return {
    authenticated: raw['authenticated'] === true,
    googleConnected: raw['google_connected'] === true,
    driveAuthorized: raw['drive_authorized'] === true,
    whatsappLinked: raw['whatsapp_linked'] === true,
    // Un paso desconocido manda al login: es el único destino que siempre
    // existe y desde el que se puede recuperar.
    nextStep: (pasos as readonly string[]).includes(paso)
      ? (paso as OnboardingStatus['nextStep'])
      : 'login',
    user: raw['user'] && typeof raw['user'] === 'object' ? (raw['user'] as AuthUser) : undefined,
  };
}

export function normalizeGoogleStatus(raw: Record<string, unknown>): GoogleStatus {
  return {
    googleConnected: raw['google_connected'] === true,
    driveAuthorized: raw['drive_authorized'] === true,
    tokenValid: raw['token_valid'] === true,
    scopes: Array.isArray(raw['scopes']) ? (raw['scopes'] as string[]) : [],
    email: typeof raw['email'] === 'string' ? raw['email'] : undefined,
  };
}
