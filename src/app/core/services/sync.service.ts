import { Injectable, inject } from '@angular/core';
import { ApiClientService } from '../api/api-client.service';
import { SyncStatus } from '../models/api.models';
import { map } from 'rxjs';
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly api = inject(ApiClientService);
  status() {
    return this.api.get<Record<string, unknown>>('/sync/status').pipe(map(normalizeSyncStatus));
  }
  run() {
    return this.api.post<Record<string, unknown>>('/sync/run');
  }
}
export function normalizeSyncStatus(r: Record<string, unknown>): SyncStatus {
  const media =
    r['media'] && typeof r['media'] === 'object'
      ? (r['media'] as Record<string, unknown>)
      : undefined;
  const history = String(r['history'] ?? '').toLowerCase();
  return {
    connected: r['connected'] === true,
    state: normalizeRunState(r),
    history:
      r['history_done'] === true
        ? 'complete'
        : history.includes('sync') || history.includes('sincron')
          ? 'syncing'
          : history.includes('error')
            ? 'error'
            : 'idle',
    mediaPending:
      typeof (media?.['pending'] ?? r['media_pending']) === 'number'
        ? ((media?.['pending'] ?? r['media_pending']) as number)
        : 0,
    backfillCurrent:
      typeof r['backfill_current'] === 'number' ? (r['backfill_current'] as number) : undefined,
    backfillTotal:
      typeof r['backfill_total'] === 'number' ? (r['backfill_total'] as number) : undefined,
    messagesNew:
      typeof (r['messages_new'] ?? r['messagesNew']) === 'number'
        ? ((r['messages_new'] ?? r['messagesNew']) as number)
        : undefined,
  };
}
function normalizeRunState(r: Record<string, unknown>): SyncStatus['state'] {
  const value = String(r['state'] ?? r['sync_state'] ?? '').toLowerCase();
  return ['idle', 'running', 'complete', 'error'].includes(value)
    ? (value as SyncStatus['state'])
    : undefined;
}
