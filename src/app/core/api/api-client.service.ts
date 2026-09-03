import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

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
    return this.http.get<T>(`${this.baseUrl}${path}`, { params: p });
  }
  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body);
  }
  url(path: string) {
    return `${this.baseUrl}${path}`;
  }
}
