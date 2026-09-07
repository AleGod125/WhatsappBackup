import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ApiClientService } from '../../../core/api/api-client.service';
import { RealtimeService } from '../../../core/events/realtime.service';

/** En qué anda la recuperación de la conversación abierta. */
export type EstadoDeHistorial =
  | 'inactivo'
  | 'recuperando'
  | 'reintentando'
  | 'esperando_referencia'
  | 'completado'
  | 'error';

/** Lo que llega en un evento `history.chat.*`. */
interface AvisoDeHistorial {
  /** El backend lo manda como entero; el modelo del frontend usa cadena.
   *  Se compara siempre como cadena para que no dependa de cual llegue. */
  chat_id?: number | string | null;
  chat_jid?: string | null;
  state?: string | null;
  messages_added?: number | null;
  error?: string | null;
  /** Numero de orden del lote, por conversacion. Es lo unico que distingue
   *  un reenvio del canal de dos lotes reales del mismo tamano. */
  seq?: number | null;
}

const POR_EVENTO: Record<string, EstadoDeHistorial> = {
  'history.chat.started': 'recuperando',
  'history.chat.progress': 'recuperando',
  'history.chat.retrying': 'reintentando',
  'history.chat.waiting_seed': 'esperando_referencia',
  'history.chat.completed': 'completado',
  'history.chat.error': 'error',
};

/**
 * El estado de recuperación de la conversación que el usuario tiene abierta.
 *
 * POR QUE EXISTE
 * --------------
 * Abrir una conversación no cambiaba nada: la excavación atendía por
 * actividad, así que si la tuya estaba en la posición treinta, te tocaba en la
 * treinta — y cada puesto puede costar 45 segundos. Ahora abrirla la pone
 * delante, y esto es lo que lo cuenta mientras pasa.
 *
 * UNA CONVERSACION A LA VEZ
 * -------------------------
 * `seguir()` cambia el foco. Los eventos de la conversación anterior dejan de
 * mutar nada al instante: se comparan contra el foco actual, no contra el que
 * había cuando llegó el evento. Sin eso, cambiar de chat rápido pinta el
 * progreso de A dentro de B.
 *
 * NO GIRA PARA SIEMPRE
 * --------------------
 * `esperando_referencia` es un estado con nombre, no un spinner eterno. Si
 * WhatsApp no ha dado una referencia de esa conversación, no se puede pedir su
 * pasado, y decirlo es más honesto que fingir que se está trabajando.
 */
@Injectable({ providedIn: 'root' })
export class HistoryProgressService {
  private readonly api = inject(ApiClientService);
  private readonly realtime = inject(RealtimeService, { optional: true });

  /** La conversación que se está mirando. `null` = ninguna. */
  private readonly foco = signal<string | null>(null);

  readonly estado = signal<EstadoDeHistorial>('inactivo');
  readonly recuperados = signal(0);
  readonly ultimoError = signal<string | null>(null);

  /** Eventos ya procesados, para que una reconexión no los cuente dos veces. */
  private readonly vistos = new Set<string>();

  /**
   * Un aviso por cada lote que entra, con el id de su conversación.
   *
   * Es lo que le dice a la vista «trae lo que acaba de llegar». Contar no
   * basta: sin esto el indicador decía «+50» y arriba no aparecía ni un
   * mensaje hasta recargar la página.
   */
  private readonly lotesSubject = new Subject<string>();
  readonly lotes$: Observable<string> = this.lotesSubject.asObservable();

  /** Si hay que enseñar algo encima del historial. */
  readonly visible = computed(() => this.estado() !== 'inactivo');

  /** Si el indicador debe girar. `esperando_referencia` NO gira. */
  readonly girando = computed(
    () => this.estado() === 'recuperando' || this.estado() === 'reintentando',
  );

  constructor() {
    // Un solo canal para todos: el servicio de tiempo real emite un flujo
    // unico con el nombre dentro, no un observable por evento.
    this.realtime?.events$?.subscribe?.((sobre) => {
      if (!sobre || !(sobre.type in POR_EVENTO)) return;
      this.procesar(sobre.type, sobre.data as AvisoDeHistorial);
    });
  }

  /**
   * Empieza a seguir una conversación, y deja de seguir la anterior.
   *
   * Devuelve la petición de prioridad para que quien llame pueda saber si esa
   * conversación puede excavarse siquiera.
   */
  seguir(chatId: string | number): Observable<unknown> {
    this.foco.set(String(chatId));
    this.estado.set('inactivo');
    this.recuperados.set(0);
    this.ultimoError.set(null);
    this.vistos.clear();
    return this.api.post(`/chats/${chatId}/history/priority`, {});
  }

  /** El usuario salió de la conversación. */
  soltar(): void {
    this.foco.set(null);
    this.estado.set('inactivo');
    this.recuperados.set(0);
  }

  /**
   * Vacía TODO. Para cuando se cierra la sesión.
   *
   * Este servicio vive en la raíz, así que sobrevive a la navegación: sin
   * esto, el id de la conversación abierta y el recuento de mensajes del
   * usuario anterior seguirían en memoria cuando otro entrara en el mismo
   * navegador. `soltar()` no basta — deja los lotes ya vistos y el último
   * error.
   */
  limpiar(): void {
    this.soltar();
    this.ultimoError.set(null);
    this.vistos.clear();
  }

  /** Lo que contesta el endpoint de prioridad, aplicado al estado. */
  aplicarRespuesta(respuesta: { waiting_seed?: boolean; state?: string | null }): void {
    if (respuesta?.waiting_seed) {
      this.estado.set('esperando_referencia');
      return;
    }
    if (respuesta?.state === 'exhausted') {
      this.estado.set('completado');
      return;
    }
    this.estado.set('recuperando');
  }

  private procesar(nombre: string, datos: AvisoDeHistorial): void {
    const actual = this.foco();
    // Un evento de OTRA conversación no puede mutar la que se está mirando.
    // La comparación va como cadena a propósito: el backend manda un entero y
    // el modelo del frontend guarda una cadena, y `1 !== '1'` habría
    // descartado TODOS los eventos en silencio.
    const suyo = datos?.chat_id === undefined || datos?.chat_id === null
      ? null
      : String(datos.chat_id);
    if (actual === null || suyo === null || suyo !== actual) return;

    if (nombre === 'history.chat.progress') {
      // Una reconexión del canal puede reenviar el mismo aviso. Se distingue
      // por el NUMERO DE ORDEN, no por el contenido: dos lotes reales de 50
      // son idénticos, y un hash del contenido descartaría el segundo.
      const orden = datos.seq;
      if (typeof orden === 'number') {
        const huella = `${suyo}:${orden}`;
        if (this.vistos.has(huella)) return;
        this.vistos.add(huella);
      }
      this.recuperados.update((n) => n + Math.max(0, datos.messages_added ?? 0));
      this.lotesSubject.next(suyo);
    }

    const siguiente = POR_EVENTO[nombre];
    if (siguiente) this.estado.set(siguiente);
    if (nombre === 'history.chat.error') this.ultimoError.set(datos.error ?? null);
  }
}
