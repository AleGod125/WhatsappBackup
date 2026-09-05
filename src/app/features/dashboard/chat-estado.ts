import { Chat } from '../../core/models/api.models';

/**
 * El estado de una conversación, dicho en un solo sitio.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * La misma conversación podía leerse a la vez como «Historial sincronizado»
 * en la cabecera y «El historial de esta conversación aún no se ha
 * recuperado» en el centro, porque cada componente decidía por su cuenta.
 * Dos frases contradictorias sobre lo mismo no son un detalle: hacen dudar de
 * todo lo demás.
 *
 * Aquí se decide una vez y todos leen lo mismo.
 *
 * EL CASO QUE FALTABA
 * -------------------
 * `exhausted` significa que el teléfono contestó que no le queda nada de ese
 * chat. Con mensajes, eso es historial completo. **Sin** mensajes, es que no
 * hay nada que recuperar — y llamarlo «sincronizado» es exacto y a la vez
 * inútil: el usuario ve una conversación vacía y cree que falló algo.
 */
export type EstadoDeChat =
  | 'SYNCED'
  | 'RECOVERING'
  | 'PENDING'
  | 'WAITING_SEED'
  | 'RETRY_PENDING'
  | 'WAITING_FOR_PHONE'
  | 'NO_MESSAGES_AVAILABLE'
  | 'ERROR';

export interface PresentacionDeChat {
  estado: EstadoDeChat;
  /** Una línea, para la lista. */
  etiqueta: string;
  /** La explicación, para la cabecera de la conversación. */
  detalle: string;
  /** Si tiene sentido ofrecer «Volver a comprobar». */
  reintentable: boolean;
  /** Si está trabajando ahora mismo: pinta un indicador. */
  enCurso: boolean;
}

const TEXTOS: Record<EstadoDeChat, Omit<PresentacionDeChat, 'estado'>> = {
  SYNCED: {
    etiqueta: 'Historial sincronizado',
    detalle: 'Historial sincronizado',
    reintentable: false,
    enCurso: false,
  },
  RECOVERING: {
    etiqueta: 'Recuperando historial…',
    detalle: 'Recuperando historial…',
    reintentable: false,
    enCurso: true,
  },
  PENDING: {
    etiqueta: 'Pendiente de recuperación',
    detalle: 'Pendiente de recuperación',
    reintentable: false,
    enCurso: true,
  },
  WAITING_SEED: {
    etiqueta: 'Esperando referencia',
    detalle:
      'Esperando una referencia para recuperar este chat. Se intentará automáticamente cuando haya una disponible.',
    reintentable: true,
    enCurso: false,
  },
  RETRY_PENDING: {
    etiqueta: 'Reintento pendiente',
    detalle: 'WhatsApp no respondió al último intento. Se reintentará automáticamente.',
    reintentable: true,
    enCurso: false,
  },
  WAITING_FOR_PHONE: {
    etiqueta: 'Esperando al teléfono',
    detalle: 'Abre WhatsApp en tu teléfono para continuar.',
    reintentable: true,
    enCurso: false,
  },
  NO_MESSAGES_AVAILABLE: {
    // No es un error y no se pinta como tal: WhatsApp entregó todo lo que
    // tenía de este chat, y resultó ser nada.
    etiqueta: 'Sin mensajes disponibles',
    detalle: 'No hay mensajes disponibles en el historial recuperado.',
    reintentable: false,
    enCurso: false,
  },
  ERROR: {
    etiqueta: 'No se pudo recuperar',
    detalle: 'No se pudo recuperar el historial de este chat.',
    reintentable: true,
    enCurso: false,
  },
};

/**
 * @param esperandoTelefono lo dice la cola de recuperación, no el chat: el
 *   teléfono dormido afecta a todos a la vez y no es un estado de ninguno.
 */
export function estadoDeChat(chat: Chat, esperandoTelefono = false): PresentacionDeChat {
  const estado = claveDeEstado(chat, esperandoTelefono);
  return { estado, ...TEXTOS[estado] };
}

export function claveDeEstado(chat: Chat, esperandoTelefono = false): EstadoDeChat {
  const mensajes = chat.messageCount ?? 0;
  const estado = chat.historyStatus;

  if (estado === 'error') return 'ERROR';
  if (estado === 'fetching') return 'RECOVERING';

  // El teléfono dormido para la tanda entera. Solo se dice de los chats que
  // de verdad estaban esperando su turno; uno ya completo no espera nada.
  if (esperandoTelefono && (estado === 'pending' || estado === 'timeout')) {
    return 'WAITING_FOR_PHONE';
  }

  if (estado === 'timeout') return 'RETRY_PENDING';
  if (estado === 'waiting_seed' || estado === 'no_valid_cursor' || chat.waitingSeed) {
    return 'WAITING_SEED';
  }
  if (estado === 'pending') return 'PENDING';

  // `server_limited` es una pasada que llegó a su tope, no un final: sigue
  // habiendo historial, así que se cuenta como pendiente.
  if (estado === 'server_limited') return 'PENDING';

  // `exhausted` y `complete`: el teléfono ya dijo lo que tenía.
  if (mensajes > 0) return 'SYNCED';
  return 'NO_MESSAGES_AVAILABLE';
}

/**
 * Lo que se ve en la lista, bajo el nombre.
 *
 * Con mensajes manda la última línea de la conversación: es lo que el usuario
 * busca. El estado sólo ocupa ese sitio cuando no hay nada que enseñar.
 */
export function lineaDeLista(chat: Chat, esperandoTelefono = false): string {
  const presentacion = estadoDeChat(chat, esperandoTelefono);
  if (presentacion.estado === 'SYNCED') return chat.preview || '';
  if (chat.preview && !presentacion.enCurso && presentacion.estado !== 'WAITING_SEED') {
    return chat.preview;
  }
  return presentacion.etiqueta;
}
