import { Chat } from '../../core/models/api.models';
import { EstadoDeChat, claveDeEstado } from './chat-estado';

/**
 * Cuántas conversaciones hay en cada situación, sin sumar lo que no se suma.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * La pantalla llegó a decir esto:
 *
 *     37 en curso
 *     6 sin referencia
 *     43 chats pendientes
 *
 * «43 pendientes» es una suma de cosas que no son lo mismo. Algo que se está
 * recuperando ahora mismo no es un fallo, y verlo dentro del mismo número que
 * lo que sí está atascado daba la impresión de 43 problemas. El usuario leía
 * un desastre donde había trabajo en curso.
 *
 * Aquí no se suma nada: cada situación se cuenta por separado y se dice con su
 * nombre. Sumarlas sólo tiene sentido para saber cuántas conversaciones hay en
 * total, y para eso está `total`.
 */
export interface Recuento {
  /** Ya tienen su historial: no hay nada más que hacer con ellas. */
  recuperados: number;
  /** Se están pidiendo AHORA. Trabajo en curso, no un problema. */
  recuperandose: number;
  /** Se agotó la espera y hay otro intento programado. */
  reintentando: number;
  /** No hay con qué pedir todavía. Depende de que aparezca una referencia. */
  esperandoReferencia: number;
  /** El servidor contestó, y no había nada que traer. */
  sinMensajes: number;
  /** Algo falló de verdad. */
  error: number;
  total: number;
}

const VACIO: Recuento = {
  recuperados: 0,
  recuperandose: 0,
  reintentando: 0,
  esperandoReferencia: 0,
  sinMensajes: 0,
  error: 0,
  total: 0,
};

/** A qué casilla va cada estado de la capa de presentación. */
const CASILLA: Record<EstadoDeChat, keyof Omit<Recuento, 'total'>> = {
  SYNCED: 'recuperados',
  NO_MESSAGES_AVAILABLE: 'sinMensajes',
  RECOVERING: 'recuperandose',
  PENDING: 'recuperandose',
  WAITING_FOR_PHONE: 'recuperandose',
  RETRY_PENDING: 'reintentando',
  WAITING_SEED: 'esperandoReferencia',
  ERROR: 'error',
};

export function contar(chats: readonly Chat[], esperandoTelefono = false): Recuento {
  const recuento: Recuento = { ...VACIO, total: chats.length };
  for (const chat of chats) {
    recuento[CASILLA[claveDeEstado(chat, esperandoTelefono)]] += 1;
  }
  return recuento;
}

/**
 * Si de verdad queda algo por hacer.
 *
 * «Sin mensajes disponibles» NO cuenta: esa conversación está tan terminada
 * como una sincronizada — el servidor contestó y no había nada. Contarla como
 * pendiente dejaría la copia marcada como incompleta para siempre por
 * conversaciones que nunca van a tener nada.
 */
export function quedaTrabajo(recuento: Recuento): boolean {
  return (
    recuento.recuperandose +
      recuento.reintentando +
      recuento.esperandoReferencia +
      recuento.error >
    0
  );
}

/**
 * Si hay una carga inicial fuerte y merece la pena explicar la espera.
 *
 * Con una o dos conversaciones en curso no hace falta un cartel: se ve solo.
 * El cartel es para cuando la lista está medio vacía y el usuario no sabe si
 * la aplicación está trabajando o colgada.
 */
export function preparandose(recuento: Recuento): boolean {
  if (recuento.total === 0) return false;
  const enMarcha = recuento.recuperandose + recuento.esperandoReferencia;
  return enMarcha >= 3 && recuento.recuperados < recuento.total;
}
