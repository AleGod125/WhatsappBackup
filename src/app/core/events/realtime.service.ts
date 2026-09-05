import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RealtimeEnvelope } from '../models/api.models';

/**
 * Los eventos a los que hay que suscribirse, uno por uno.
 *
 * AQUÍ ESTABA EL FALLO
 * --------------------
 * `EventSource` entrega un evento **con nombre** sólo a quien se registró con
 * ese nombre exacto; `onmessage` recoge únicamente los que no lo llevan. Y
 * todos los de este backend lo llevan.
 *
 * Faltaban en esta lista `chat.status`, `chat.inventory`, `chat.created` y
 * `heartbeat`. O sea: el backend los publicaba, el stream los transportaba, y
 * el navegador los tiraba sin más. El panel tenía código para tratarlos que no
 * podía ejecutarse nunca, y de ahí salía la sensación de aplicación congelada
 * — la única salida era F5.
 *
 * Por eso esta lista es lo primero que hay que mirar cuando algo «no llega», y
 * por eso hay una prueba que la compara con lo que publica el backend: una
 * lista que hay que acordarse de actualizar se acaba quedando corta.
 */
export const EVENT_NAMES = [
  // -- Sesión y vinculación ----------------------------------------------
  'session.state',
  'session.qr',
  // -- Conversaciones ------------------------------------------------------
  'chat.created',
  'chat.updated',
  'chat.status',
  'chat.inventory',
  // -- Mensajes y adjuntos -------------------------------------------------
  'message.created',
  'message.updated',
  'media.updated',
  // -- Historial -----------------------------------------------------------
  'history.progress',
  'backfill.progress',
  'sync.status',
  'history.recheck.started',
  'history.recheck.progress',
  'history.recheck.completed',
  'history.backfill.started',
  'history.backfill.completed',
  'history.recovery.started',
  'history.recovery.progress',
  'history.recovery.completed',
  'history.seed.found',
  'history.seed.not_found',
  'history.web_seeds.started',
  'history.web_seeds.completed',
  'history.waiting_for_phone',
  'history.recovery_resumed',
  // -- Latido: no trae datos, pero dice que el canal sigue vivo -----------
  'heartbeat',
] as const;

/** En qué situación está el canal en tiempo real. */
export type RealtimeState = 'LIVE' | 'RECONNECTING' | 'OFFLINE';

/**
 * Cuánto se tolera sin recibir NADA —ni evento ni latido— antes de dar el
 * canal por muerto.
 *
 * El backend manda un latido cada pocos segundos, así que un silencio largo no
 * es tranquilidad: es que el canal se cayó sin avisar. `EventSource` no
 * siempre dispara `onerror` cuando eso pasa —un proxy que se traga la conexión
 * la deja abierta y muda—, y sin este reloj la pantalla se queda esperando
 * indefinidamente un evento que ya no puede llegar.
 */
export const SILENCIO_MAXIMO_MS = 90_000;

/** Cada cuánto se comprueba ese silencio. */
export const RONDA_DE_VIGILANCIA_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly zone = inject(NgZone);
  private readonly eventsSubject = new Subject<RealtimeEnvelope>();
  private readonly connectionSubject = new Subject<'connected' | 'disconnected'>();
  private source?: EventSource;
  private vigilante?: ReturnType<typeof setInterval>;
  private ultimaSenal = 0;

  readonly events$: Observable<RealtimeEnvelope> = this.eventsSubject.asObservable();
  readonly connection$: Observable<'connected' | 'disconnected'> =
    this.connectionSubject.asObservable();

  /**
   * Para el indicador de la pantalla. Tres estados, no dos: «reconectando» y
   * «sin conexión» piden cosas distintas al usuario —uno esperar y el otro
   * mirar su red— y mezclarlos no dice nada.
   */
  readonly state = signal<RealtimeState>('OFFLINE');

  connect(): void {
    // Una sola conexión por aplicación. `EventSource` ya reconecta solo; abrir
    // otra en cada error acabaría con veinte streams abiertos contra el mismo
    // backend.
    if (this.source) return;

    // `withCredentials` NO es opcional aquí.
    //
    // La sesión va en una cookie HttpOnly y `EventSource` **no pasa por el
    // interceptor de HttpClient**, así que la configuración de `withCredentials`
    // del resto de la app no le aplica. Sin esto la cookie no viaja, el backend
    // responde 401 y el frontend se queda sin enterarse de nada: era justo lo
    // que dejaba la pantalla de vinculación colgada tras conectar.
    const source = new EventSource(`${environment.apiBaseUrl}/events/stream`, {
      withCredentials: true,
    });
    this.source = source;
    this.state.set('RECONNECTING');

    source.onopen = () =>
      this.zone.run(() => {
        this.ultimaSenal = Date.now();
        this.state.set('LIVE');
        this.connectionSubject.next('connected');
      });
    source.onerror = () =>
      this.zone.run(() => {
        // `EventSource` reintenta solo, así que esto no es «se acabó»: es
        // «ahora mismo no hay canal». Se dice tal cual.
        this.state.set('RECONNECTING');
        this.connectionSubject.next('disconnected');
      });
    source.onmessage = (event) => this.emit('message', event.data);
    for (const name of EVENT_NAMES)
      source.addEventListener(name, (event) => this.emit(name, (event as MessageEvent).data));

    this.vigilar();
  }

  disconnect(): void {
    this.source?.close();
    this.source = undefined;
    if (this.vigilante) clearInterval(this.vigilante);
    this.vigilante = undefined;
    this.state.set('OFFLINE');
  }

  /**
   * El reloj que detecta un canal muerto que nadie declaró muerto.
   *
   * Se mide el silencio, no los errores: un canal que se cae limpiamente
   * dispara `onerror`, pero uno que se queda abierto y mudo no dispara nada.
   */
  private vigilar(): void {
    if (this.vigilante) clearInterval(this.vigilante);
    this.ultimaSenal = Date.now();
    // Fuera de Angular: un reloj que corre cada quince segundos no tiene por
    // qué disparar una detección de cambios cada vez.
    this.zone.runOutsideAngular(() => {
      this.vigilante = setInterval(() => {
        if (Date.now() - this.ultimaSenal <= SILENCIO_MAXIMO_MS) return;
        this.zone.run(() => {
          if (this.state() === 'LIVE') this.connectionSubject.next('disconnected');
          this.state.set('RECONNECTING');
          // Se levanta una conexión nueva: la anterior está muda y
          // `EventSource` no va a volver solo de un silencio así.
          this.reconectar();
        });
      }, RONDA_DE_VIGILANCIA_MS);
    });
  }

  private reconectar(): void {
    this.source?.close();
    this.source = undefined;
    this.connect();
  }

  private emit(fallbackType: string, payload: string): void {
    // Cualquier cosa que llegue —incluido el latido— dice que el canal vive.
    this.ultimaSenal = Date.now();
    this.zone.run(() => {
      if (this.state() !== 'LIVE') this.state.set('LIVE');
      // El latido no lleva nada que la pantalla tenga que pintar: sólo sirve
      // para saber que esto sigue en pie.
      if (fallbackType === 'heartbeat') return;
      try {
        const parsed = JSON.parse(payload) as unknown;
        if (parsed && typeof parsed === 'object' && 'type' in parsed) {
          const envelope = parsed as RealtimeEnvelope;
          this.eventsSubject.next({ type: String(envelope.type), data: envelope.data ?? parsed });
        } else this.eventsSubject.next({ type: fallbackType, data: parsed });
      } catch {
        this.eventsSubject.next({ type: fallbackType, data: payload });
      }
    });
  }
}
