import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClientService } from '../api/api-client.service';
import { StorageStatus } from '../models/api.models';

/**
 * Estado de la copia hacia el almacenamiento.
 *
 * Angular NO sabe que detrás hay Google Drive: pregunta al backend y recibe
 * "al día / sincronizando / hay que reconectar". Ningún identificador de
 * archivo, ningún token y ningún enlace de Google cruzan esta frontera.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly api = inject(ApiClientService);

  status(): Observable<StorageStatus> {
    return this.api.get<Record<string, unknown>>('/storage/status').pipe(map(normalizeStorage));
  }

  /** Idempotente: si la carpeta ya existe, no crea otra. */
  setup(): Observable<{ rootReady: boolean }> {
    return this.api
      .post<Record<string, unknown>>('/storage/setup')
      .pipe(map((raw) => ({ rootReady: raw['root_ready'] === true })));
  }

  /** Reanuda lo que quedó en pausa tras reconectar Google. */
  resume(): Observable<{ resumed: number }> {
    return this.api
      .post<Record<string, unknown>>('/storage/resume')
      .pipe(map((raw) => ({ resumed: numeroO(raw['resumed'], 0) })));
  }
}

const ESTADOS: StorageStatus['state'][] = [
  'disabled',
  'up_to_date',
  'syncing',
  'paused',
  'error',
  'blocked',
  'reauthorization_required',
];

export function normalizeStorage(raw: Record<string, unknown>): StorageStatus {
  const estado = String(raw['state'] ?? '');
  return {
    enabled: raw['enabled'] === true,
    connected: raw['connected'] === true,
    authorized: raw['authorized'] === true,
    rootReady: raw['root_ready'] === true,
    encrypted: raw['encrypted'] === true,
    pendingJobs: numeroO(raw['pending_jobs'], 0),
    failedJobs: numeroO(raw['failed_jobs'], 0),
    pausedJobs: numeroO(raw['paused_jobs'], 0),
    pendingBytes: numeroO(raw['pending_bytes'], 0),
    bytesUploaded: numeroO(raw['bytes_uploaded'], 0),
    filesUploaded: numeroO(raw['files_uploaded'], 0),
    lastUploadAt: typeof raw['last_upload_at'] === 'string' ? raw['last_upload_at'] : undefined,
    // Un estado desconocido no puede pintarse como "al día": eso diría que
    // todo está guardado cuando no se sabe.
    state: ESTADOS.includes(estado as StorageStatus['state'])
      ? (estado as StorageStatus['state'])
      : 'error',
  };
}

const numeroO = (valor: unknown, porDefecto: number): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : porDefecto;
