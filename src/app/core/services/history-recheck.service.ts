import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { ApiClientService } from '../api/api-client.service';
import { RecheckChatState, RecheckJob } from '../models/api.models';

/**
 * Revisar historiales pendientes con lo que ya tenemos en casa.
 *
 * Un chat queda en `waiting_seed` cuando llego del emparejamiento como pura
 * metadata, sin un solo identificador de mensaje. `HISTORY_SYNC_ON_DEMAND` va
 * anclado por definicion —hay que decirle desde que mensaje seguir hacia
 * atras—, asi que sin esa referencia no se puede pedir nada.
 *
 * Esta revision vuelve a mirar con lo que sabemos hoy: resuelve los alias del
 * contacto (el ancla puede estar guardada bajo su otro identificador) y
 * reinterpreta los blobs de historial que WhatsApp YA entrego. Si aparece un
 * ancla, el chat vuelve a la cola y pywhats pide su historial.
 *
 * No vincula ningun dispositivo y no pide un segundo QR. La recuperacion
 * auxiliar con Baileys se retiro del frontend: vive en `app/experimental` del
 * backend, tras `WEB_BOOTSTRAP_ENABLED`.
 */
@Injectable({ providedIn: 'root' })
export class HistoryRecheckService {
  private readonly api = inject(ApiClientService);

  /**
   * Revisa TODOS los chats pendientes. Responde enseguida con un job.
   *
   * `auto` es la revision que el panel dispara al abrirse o al refrescar. El
   * backend le aplica una espera entre ejecuciones —reinterpretar los blobs de
   * decenas de chats no es gratis y un F5 repetido no cambia nada— y, si ya
   * hay una en marcha, devuelve esa en vez de fallar. El boton del usuario va
   * sin `auto`: si lo pulsa, es que quiere mirar ya.
   */
  recheckPending(options: { auto?: boolean } = {}) {
    const ruta = options.auto ? '/history/recheck-pending?auto=1' : '/history/recheck-pending';
    return this.api.post<Record<string, unknown>>(ruta).pipe(map(normalizeRecheckJob));
  }

  /** Revisa un solo chat. Devuelve el resultado ya hecho, no un job. */
  recheckChat(chatId: number | string) {
    return this.api
      .post<Record<string, unknown>>(`/chats/${encodeURIComponent(String(chatId))}/history/recheck`)
      .pipe(map(normalizeChatRecheck));
  }

  status(jobId: string) {
    return this.api
      .get<Record<string, unknown>>(`/history/recheck-pending/status/${encodeURIComponent(jobId)}`)
      .pipe(map(normalizeRecheckJob));
  }
}

const ESTADOS_TRABAJO = ['starting', 'running', 'completed', 'failed'] as const;
const ESTADOS_CHAT: RecheckChatState[] = [
  'waiting_seed',
  'rechecking',
  'seed_found',
  'fetching_history',
  'error',
];

export function normalizeRecheckJob(raw: Record<string, unknown>): RecheckJob {
  const state = String(raw['state'] ?? 'starting').toLowerCase();
  const current =
    raw['current_chat'] && typeof raw['current_chat'] === 'object'
      ? (raw['current_chat'] as Record<string, unknown>)
      : undefined;
  return {
    jobId: String(raw['job_id'] ?? ''),
    state: (ESTADOS_TRABAJO as readonly string[]).includes(state)
      ? (state as RecheckJob['state'])
      : 'starting',
    total: numberOr(raw['total'], 0),
    processed: numberOr(raw['processed'], 0),
    recovered: numberOr(raw['recovered'], 0),
    stillWaiting: numberOr(raw['still_waiting'], 0),
    errors: numberOr(raw['errors'], 0),
    messagesRecovered: numberOr(raw['messages_recovered'], 0),
    skipped: raw['skipped'] === true,
    currentChat: current
      ? {
          id: numberOr(current['id'], 0),
          name: typeof current['name'] === 'string' ? current['name'] : undefined,
          state: ESTADOS_CHAT.includes(String(current['state']) as RecheckChatState)
            ? (String(current['state']) as RecheckChatState)
            : 'rechecking',
        }
      : undefined,
    error: typeof raw['error'] === 'string' ? raw['error'] : undefined,
    elapsedSeconds: numberOr(raw['elapsed_seconds'], 0),
  };
}

/** El resultado de revisar UN chat, traducido a la misma forma de trabajo. */
export function normalizeChatRecheck(raw: Record<string, unknown>): RecheckJob {
  const encontrado = raw['seed_found'] === true || raw['can_dig'] === true;
  return {
    jobId: 'chat',
    state: 'completed',
    total: 1,
    processed: 1,
    recovered: encontrado ? 1 : 0,
    stillWaiting: encontrado ? 0 : 1,
    errors: 0,
    messagesRecovered: numberOr(raw['messages_recovered'], 0),
    skipped: false,
    currentChat: undefined,
    error: undefined,
  };
}

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
