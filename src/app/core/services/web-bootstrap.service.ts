import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { ApiClientService } from '../api/api-client.service';
import { WebBootstrapState } from '../models/api.models';

export interface RecoveryCommand {
  state: WebBootstrapState;
  qrRequired: boolean;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class WebBootstrapService {
  private readonly api = inject(ApiClientService);
  recoverPending() {
    return this.api
      .post<Record<string, unknown>>('/history/web-bootstrap/recover-pending')
      .pipe(map(normalizeRecoveryCommand));
  }
  recoverChat(chatId: number) {
    return this.api
      .post<Record<string, unknown>>(`/chats/${encodeURIComponent(String(chatId))}/history/recover`)
      .pipe(map(normalizeRecoveryCommand));
  }
  qrUrl() {
    return this.api.url(`/history/web-bootstrap/qr?v=${Date.now()}`);
  }
}

export function normalizeRecoveryCommand(raw: Record<string, unknown>): RecoveryCommand {
  const state = String(raw['state'] ?? raw['status'] ?? 'starting').toLowerCase();
  const allowed: WebBootstrapState[] = [
    'inactive',
    'starting',
    'qr_required',
    'connecting',
    'searching_chat',
    'seed_found',
    'seed_validated',
    'seed_emitted',
    'backfill_pending',
    'completed',
    'failed',
  ];
  return {
    state: allowed.includes(state as WebBootstrapState) ? (state as WebBootstrapState) : 'starting',
    qrRequired:
      raw['qr_required'] === true ||
      raw['requires_qr'] === true ||
      raw['qr_available'] === true ||
      state === 'qr_required',
    message:
      typeof (raw['message'] ?? raw['error']) === 'string'
        ? String(raw['message'] ?? raw['error'])
        : undefined,
  };
}
