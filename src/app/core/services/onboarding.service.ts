import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClientService } from '../api/api-client.service';

/**
 * En qué punto va la recuperación del historial.
 *
 * No confundir con `/onboarding/status`, que contesta otra pregunta: por
 * dónde va el usuario dentro del alta y a qué pantalla mandarlo. Ésta cuenta
 * qué está pasando una vez dentro.
 *
 *
 * Una sola llamada con todo lo que la pantalla necesita: si falta escanear el
 * código principal, si falta el segundo, si está recuperando o si terminó.
 * Antes esto había que deducirlo juntando cuatro endpoints y contadores
 * sueltos, y cada pantalla lo deducía a su manera.
 *
 * Es estado de **ejecución**: describe un momento, no algo que se guarde.
 */
export type OnboardingPhase =
  | 'pairing_primary'
  // Un corte pasajero NO es "vuelve a vincular": las credenciales siguen
  // valiendo. Ensenar el codigo aqui manda al usuario a rehacer algo que no
  // esta roto, y encima el que veria seria el que no toca.
  | 'reconnecting'
  | 'pairing_web'
  | 'waiting_web'
  | 'initial_sync'
  | 'recovering_history'
  | 'waiting_for_phone'
  | 'partial'
  | 'complete';

export interface OnboardingStatus {
  phase: OnboardingPhase;
  primaryLinked: boolean;
  /** Por que NO esta lista la principal, cuando no lo esta. */
  primaryReason?: string;
  /** Se cayo el socket, pero la sesion vale: no hay nada que vincular. */
  primaryReconnecting: boolean;
  /** Que decirle al usuario, ya en sus palabras. */
  primaryMessage?: string;
  web: {
    enabled: boolean;
    running: boolean;
    ready: boolean;
    qrAvailable: boolean;
    qrGeneration: number;
    state: string;
  };
  recovery: {
    seedsApplied: number;
    chatsPromoted: number;
    waitingReason?: string;
    attempts: number;
  };
  counts: {
    chatsTotal: number;
    waitingSeed: number;
    pending: number;
    fetching: number;
    timeout: number;
    exhausted: number;
  };
  queue?: {
    pending: number;
    paused: boolean;
    waitingForPhone: boolean;
    dug: number;
  };
}

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly api = inject(ApiClientService);

  status(): Observable<OnboardingStatus> {
    return this.api
      .get<Record<string, unknown>>('/onboarding/recovery')
      .pipe(map(normalizeOnboarding));
  }
}

const num = (value: unknown): number => (typeof value === 'number' ? value : 0);
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const FASES: OnboardingPhase[] = [
  'pairing_primary',
  'reconnecting',
  'pairing_web',
  'waiting_web',
  'initial_sync',
  'recovering_history',
  'waiting_for_phone',
  'partial',
  'complete',
];

export function normalizeOnboarding(r: Record<string, unknown>): OnboardingStatus {
  const web = obj(r['web_companion']);
  const recovery = obj(r['recovery']);
  const counts = obj(r['counts']);
  const queue = r['queue'] ? obj(r['queue']) : undefined;
  const bruto = String(r['phase'] ?? '');

  return {
    // Una fase que no reconocemos NO se muestra como terminada.
    phase: (FASES as string[]).includes(bruto) ? (bruto as OnboardingPhase) : 'recovering_history',
    primaryLinked: obj(r['primary'])['linked'] === true,
    primaryReason:
      typeof obj(r['primary'])['reason'] === 'string'
        ? (obj(r['primary'])['reason'] as string)
        : undefined,
    primaryReconnecting: obj(r['primary'])['reconnecting'] === true,
    primaryMessage:
      typeof obj(r['primary'])['message'] === 'string' && obj(r['primary'])['message']
        ? (obj(r['primary'])['message'] as string)
        : undefined,
    web: {
      enabled: web['enabled'] === true,
      running: web['running'] === true,
      ready: web['ready'] === true,
      qrAvailable: web['qr_available'] === true,
      qrGeneration: num(web['qr_generation']),
      state: String(web['state'] ?? 'disabled'),
    },
    recovery: {
      seedsApplied: num(recovery['seeds_applied']),
      chatsPromoted: num(recovery['chats_promoted']),
      waitingReason:
        typeof recovery['waiting_reason'] === 'string'
          ? (recovery['waiting_reason'] as string)
          : undefined,
      attempts: num(recovery['attempts']),
    },
    counts: {
      chatsTotal: num(counts['chats_total']),
      waitingSeed: num(counts['waiting_seed']),
      pending: num(counts['pending']),
      fetching: num(counts['fetching']),
      timeout: num(counts['timeout']),
      exhausted: num(counts['exhausted']),
    },
    queue: queue
      ? {
          pending: num(queue['pending']),
          paused: queue['paused'] === true,
          waitingForPhone: queue['waiting_for_phone'] === true,
          dug: num(queue['dug']),
        }
      : undefined,
  };
}
