import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { ApiClientService } from '../api/api-client.service';
import { HealthStatus, QrStatus, SessionState, SessionStateCode } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiClientService);
  health() {
    return this.api.get<Record<string, unknown>>('/health').pipe(map(normalizeHealth));
  }
  getSession() {
    return this.api.get<Record<string, unknown>>('/session').pipe(map(normalizeSession));
  }
  pair() {
    return this.api.post<Record<string, unknown>>('/session/pair').pipe(map(normalizeSession));
  }
  qr() {
    return this.api.get<Record<string, unknown>>('/session/qr').pipe(
      map((value): QrStatus => ({
        available: value['available'] === true,
        imageUrl: typeof value['image_url'] === 'string' ? value['image_url'] : undefined,
        generation: typeof value['generation'] === 'number' ? value['generation'] : undefined,
        expiresAt: typeof value['expires_at'] === 'string' ? value['expires_at'] : undefined,
        expiresInSeconds:
          typeof value['expires_in_seconds'] === 'number' ? value['expires_in_seconds'] : undefined,
      })),
    );
  }
  qrImageUrl(generation?: number) {
    return this.api.url(
      generation === undefined
        ? `/session/qr/image?size=560&v=${Date.now()}`
        : `/session/qr/image?generation=${generation}&size=560`,
    );
  }
}

export function normalizeSession(raw: Record<string, unknown>): SessionState {
  const value =
    raw['session'] && typeof raw['session'] === 'object'
      ? (raw['session'] as Record<string, unknown>)
      : raw;
  const text = String(value['state'] ?? value['status'] ?? '').toUpperCase();
  const connected = value['connected'] === true || text === 'CONNECTED';
  const allowed: SessionStateCode[] = [
    'STARTING',
    'NO_SESSION',
    'PAIRING_REQUIRED',
    'PAIRING',
    'QR_READY',
    'CONNECTING',
    'CONNECTED',
    'DISCONNECTED',
    'SESSION_INVALID',
    'ERROR',
  ];
  return {
    state: connected
      ? 'CONNECTED'
      : allowed.includes(text as SessionStateCode)
        ? (text as SessionStateCode)
        : 'NO_SESSION',
    connected,
    viewerAllowed: value['viewer_allowed'] === true,
    whatsappEnabled: value['whatsapp_enabled'] !== false,
    generation: typeof value['generation'] === 'number' ? value['generation'] : undefined,
    message: typeof value['message'] === 'string' ? value['message'] : undefined,
    qrAvailable: value['qr_available'] === true || value['qrAvailable'] === true,
  };
}
export function normalizeHealth(value: Record<string, unknown>): HealthStatus {
  return {
    status: String(value['status'] ?? 'error'),
    state: typeof value['state'] === 'string' ? (value['state'] as SessionStateCode) : undefined,
    database: value['database'] === true,
    whatsappEnabled: value['whatsapp_enabled'] !== false,
    sessionFilePresent: value['session_file_present'] === true,
    apiVersion: typeof value['api_version'] === 'string' ? value['api_version'] : undefined,
  };
}
