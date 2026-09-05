import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Cookie legible que el backend emite junto a la sesion. */
const CSRF_COOKIE = 'whatsapp_backup_csrf';

/**
 * Toda llamada a la API pasa por aqui.
 *
 * Dos cosas que no son opcionales:
 *
 * - `withCredentials`: la sesion viaja en una cookie, y sin esto el navegador
 *   no la envia entre origenes (`:4200` -> `:5000`). Todo respondería 401.
 * - `X-CSRF-Token` en las escrituras: se copia de una cookie legible. Otro
 *   sitio puede provocar la peticion, pero no puede LEER la cookie para
 *   rellenar la cabecera.
 */
@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly http = inject(HttpClient);
  readonly baseUrl = environment.apiBaseUrl;
  get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Observable<T> {
    let p = new HttpParams();
    for (const [key, value] of Object.entries(params ?? {}))
      if (value !== undefined) p = p.set(key, String(value));
    return this.http.get<T>(`${this.baseUrl}${path}`, {
      params: p,
      withCredentials: true,
    });
  }
  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body, {
      withCredentials: true,
      headers: this.csrfHeaders(),
    });
  }

  put<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, body, {
      withCredentials: true,
      headers: this.csrfHeaders(),
    });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`, {
      withCredentials: true,
      headers: this.csrfHeaders(),
    });
  }

  private csrfHeaders(): Record<string, string> {
    const token = leerCookie(CSRF_COOKIE);
    return token ? { 'X-CSRF-Token': token } : {};
  }
  url(path: string) {
    return `${this.baseUrl}${path}`;
  }
}

function leerCookie(nombre: string): string | undefined {
  for (const trozo of document.cookie.split(';')) {
    const [clave, ...resto] = trozo.trim().split('=');
    if (clave === nombre) return decodeURIComponent(resto.join('='));
  }
  return undefined;
}
