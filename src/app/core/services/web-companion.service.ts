import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClientService } from '../api/api-client.service';
import { environment } from '../../../environments/environment';

/**
 * Web Companion: un dispositivo vinculado APARTE, sólo para medir.
 *
 * Angular no habla con Node. Habla con Flask, como con todo lo demás; Flask
 * supervisa el worker y traduce lo que dice.
 *
 * Su QR **no** es el del emparejamiento principal: es otra sesión, otro
 * aparato en la lista del teléfono. Por eso `experimental` viaja siempre en la
 * respuesta y la pantalla lo marca.
 */
export type WebCompanionState =
  'disabled' | 'starting' | 'qr_required' | 'connected' | 'ready' | 'error' | 'stopped';

export interface WebCompanionStatus {
  enabled: boolean;
  running: boolean;
  processRunning: boolean;
  authenticated: boolean;
  webClientReady: boolean;
  storeReady: boolean;
  probeRunning: boolean;
  startupTimeout: boolean;
  state: WebCompanionState;
  /**
   * Si hay un QR que escanear. El payload NO viaja: la imagen la pinta el
   * backend, igual que la del emparejamiento principal.
   */
  qrAvailable: boolean;
  /** Sube con cada QR nuevo. Es lo que fuerza a repintar la imagen. */
  qrGeneration: number;
  qrAgeSeconds?: number;
  error?: string;
  canStart: boolean;
  reason?: string;
  experimental: boolean;
  /** Qué métodos del Store existen de verdad en esta versión. */
  capabilities?: Record<string, boolean>;
}

export interface WebCompanionInventory {
  pythonChats: number;
  webGetChats: number;
  webStoreChats: number;
  unionChats: number;
  /** Conversaciones que ve Web y el backend no. Es el número que decide. */
  extraVsPython: number;
  missingVsPython: number;
  individual: number;
  group: number;
}

export interface WebCompanionProbe {
  waiting: number;
  visibleStore: number;
  withMessages: number;
  /** Lo que propuso el worker… */
  candidates: number;
  /** …y lo que pasa las reglas del backend. Este es el que cuenta. */
  seedUsable: number;
  sinSeed: number;
  rejections: Record<string, number>;
  bySource: Record<string, number>;
  wakeableChats: number;
  /** El backend lo declara: esta fase no cambia nada. */
  readOnly: boolean;
}

/**
 * El resultado de APLICAR las referencias. Esta acción sí escribe.
 *
 * Cada número cuenta una cosa distinta a propósito: `inserted` son anclas
 * nuevas, `alreadyPresent` las que ya estaban (aplicar dos veces no duplica
 * nada) y `promoted` las conversaciones que gracias a eso pueden por fin
 * pedir su historial.
 */
export interface WebSeedApplyResult {
  candidates: number;
  validated: number;
  inserted: number;
  alreadyPresent: number;
  promoted: number;
  rejected: number;
  stillWaiting: number;
  capability: string;
  enqueued: number;
  queue?: WebRecoveryQueue;
}

/** Cómo va la tanda de recuperación. */
export interface WebRecoveryQueue {
  pending: number;
  paused: boolean;
  pauseReason?: string;
  /** El teléfono dejó de responder. No es un fallo del protocolo. */
  waitingForPhone: boolean;
  dug: number;
}

@Injectable({ providedIn: 'root' })
export class WebCompanionService {
  private readonly api = inject(ApiClientService);

  /**
   * URL de la imagen del QR.
   *
   * Lleva la generación para que el navegador no reutilice la anterior: el
   * QR rota cada pocos segundos y una imagen cacheada es un código muerto que
   * el usuario intenta escanear una y otra vez.
   */
  qrImageUrl(generation: number, size = 456): string {
    return `${environment.apiBaseUrl}/web-companion/qr/image?generation=${generation}&size=${size}`;
  }

  status(): Observable<WebCompanionStatus> {
    return this.api
      .get<Record<string, unknown>>('/web-companion/status')
      .pipe(map(normalizeStatus));
  }

  start(): Observable<WebCompanionStatus> {
    return this.api
      .post<Record<string, unknown>>('/web-companion/start', {})
      .pipe(map(normalizeStatus));
  }

  inventory(): Observable<WebCompanionInventory> {
    return this.api
      .post<Record<string, unknown>>('/web-companion/inventory', {})
      .pipe(map(normalizeInventory));
  }

  probe(): Observable<WebCompanionProbe> {
    return this.api
      .post<Record<string, unknown>>('/web-companion/probe', {})
      .pipe(map(normalizeProbe));
  }

  /**
   * Convierte las referencias de Web en anclas reales y arranca la
   * recuperación. Es la ÚNICA llamada de aquí que escribe, y por eso vive en
   * su propio botón: medir y mutar no pueden compartir uno.
   */
  applySeeds(): Observable<WebSeedApplyResult> {
    return this.api
      .post<Record<string, unknown>>('/web-companion/seeds/apply', {})
      .pipe(map(normalizeApply));
  }

  /** Continúa una recuperación que se paró porque el teléfono no respondía. */
  resume(): Observable<WebRecoveryQueue | undefined> {
    return this.api
      .post<Record<string, unknown>>('/web-companion/seeds/resume', {})
      .pipe(map((r) => normalizeQueue(r['queue'])));
  }
}

const num = (value: unknown): number => (typeof value === 'number' ? value : 0);
const record = (value: unknown): Record<string, number> =>
  value && typeof value === 'object' ? (value as Record<string, number>) : {};

export function normalizeStatus(r: Record<string, unknown>): WebCompanionStatus {
  const estados: WebCompanionState[] = [
    'disabled',
    'starting',
    'qr_required',
    'connected',
    'ready',
    'error',
    'stopped',
  ];
  const bruto = String(r['state'] ?? 'disabled');
  return {
    enabled: r['enabled'] === true,
    running: r['running'] === true,
    processRunning: r['process_running'] === true || r['running'] === true,
    authenticated: r['authenticated'] === true,
    webClientReady: r['web_client_ready'] === true,
    storeReady: r['store_ready'] === true,
    probeRunning: r['probe_running'] === true,
    startupTimeout: r['startup_timeout'] === true,
    // Un estado que no reconocemos NO se muestra como si fuera bueno.
    state: (estados as string[]).includes(bruto) ? (bruto as WebCompanionState) : 'error',
    qrAvailable: r['qr_available'] === true,
    qrGeneration: typeof r['qr_generation'] === 'number' ? r['qr_generation'] : 0,
    qrAgeSeconds: typeof r['qr_age_seconds'] === 'number' ? r['qr_age_seconds'] : undefined,
    error: typeof r['error'] === 'string' ? r['error'] : undefined,
    canStart: r['can_start'] === true,
    reason: typeof r['reason'] === 'string' ? r['reason'] : undefined,
    experimental: r['experimental'] !== false,
    capabilities:
      r['capabilities'] && typeof r['capabilities'] === 'object'
        ? (r['capabilities'] as Record<string, boolean>)
        : undefined,
  };
}

export function normalizeInventory(r: Record<string, unknown>): WebCompanionInventory {
  const m = (r['metrics'] ?? {}) as Record<string, unknown>;
  return {
    pythonChats: num(m['python_chats']),
    webGetChats: num(m['web_get_chats']),
    webStoreChats: num(m['web_store_chats']),
    unionChats: num(m['union_chats']),
    extraVsPython: num(m['extra_vs_python']),
    missingVsPython: num(m['missing_vs_python']),
    individual: num(m['individual']),
    group: num(m['group']),
  };
}

export function normalizeProbe(r: Record<string, unknown>): WebCompanionProbe {
  return {
    waiting: num(r['waiting']),
    visibleStore: num(r['visible_store']),
    withMessages: num(r['with_messages']),
    candidates: num(r['candidates']),
    seedUsable: num(r['seed_usable']),
    sinSeed: num(r['sin_seed']),
    rejections: record(r['rejections']),
    bySource: record(r['by_source']),
    wakeableChats: num(r['wakeable_chats']),
    // Por omisión NO se afirma que sea de sólo lectura: lo tiene que decir el
    // backend explícitamente.
    readOnly: r['read_only'] === true,
  };
}

export function normalizeQueue(value: unknown): WebRecoveryQueue | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const r = value as Record<string, unknown>;
  return {
    pending: num(r['pending']),
    paused: r['paused'] === true,
    pauseReason: typeof r['pause_reason'] === 'string' ? r['pause_reason'] : undefined,
    waitingForPhone: r['waiting_for_phone'] === true,
    dug: num(r['dug']),
  };
}

export function normalizeApply(r: Record<string, unknown>): WebSeedApplyResult {
  return {
    candidates: num(r['candidates']),
    validated: num(r['validated']),
    inserted: num(r['inserted']),
    alreadyPresent: num(r['already_present']),
    promoted: num(r['promoted_to_pending']),
    rejected: num(r['rejected']),
    stillWaiting: num(r['still_waiting_without_seed']),
    // No se asume nada: si el backend no lo dice, no se sabe.
    capability:
      typeof r['on_demand_capability'] === 'string'
        ? (r['on_demand_capability'] as string)
        : 'UNKNOWN',
    enqueued: num(r['enqueued']),
    queue: normalizeQueue(r['queue']),
  };
}
