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
  const result =
    r['result'] && typeof r['result'] === 'object' ? (r['result'] as Record<string, unknown>) : {};
  const chats =
    r['chats'] && typeof r['chats'] === 'object' ? (r['chats'] as Record<string, unknown>) : {};
  const byState =
    chats['por_estado'] && typeof chats['por_estado'] === 'object'
      ? (chats['por_estado'] as Record<string, unknown>)
      : {};
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
    synced: numberValue(chats['chats_complete'] ?? r['synced'] ?? result['synced']),
    waitingSeed: numberValue(
      chats['chats_waiting_seed'] ?? r['waiting_seed'] ?? result['waiting_seed'],
    ),
    timeouts: numberValue(byState['timeout'] ?? r['timeouts'] ?? result['timeouts']),
    errors: numberValue(r['errors'] ?? result['errors']),
    pending: numberValue(chats['chats_pending'] ?? r['pending'] ?? result['pending']),
  };
}
const numberValue = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;
function normalizeRunState(r: Record<string, unknown>): SyncStatus['state'] {
  const value = String(r['state'] ?? r['sync_state'] ?? '').toLowerCase();
  return ['idle', 'running', 'complete', 'error'].includes(value)
    ? (value as SyncStatus['state'])
    : undefined;
}
