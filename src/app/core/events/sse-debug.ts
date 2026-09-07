import { isDevMode } from '@angular/core';

/**
 * Rastro del canal en vivo, SOLO en desarrollo.
 *
 * POR QUE EXISTE
 * --------------
 * Cuando un mensaje no aparece hay cuatro sitios donde puede haberse perdido
 * —no llegó al navegador, llegó con otro nombre de evento, llegó y se
 * descartó por la conversación, o llegó y no se pintó— y desde fuera los
 * cuatro se ven igual: la pantalla quieta.
 *
 * El caso que más cuesta encontrar es el tercero, porque `append()` descarta
 * en silencio: basta que el id de conversación llegue como número y se
 * compare con una cadena para que **todos** los mensajes se caigan sin un
 * solo error en consola.
 *
 * POR QUE NO SE QUEDA EN PRODUCCION
 * ---------------------------------
 * `isDevMode()` es falso en el build de producción, así que estas líneas no
 * llegan a la consola del usuario. Un canal en vivo con tráfico normal
 * llenaría la consola en segundos y no le sirve de nada a quien sólo quiere
 * ver sus mensajes.
 */
export function sseDebug(evento: string, detalle?: Record<string, unknown>): void {
  if (!isDevMode()) return;
  // eslint-disable-next-line no-console
  console.debug(`[SSE-FE] ${evento}`, detalle ?? '');
}
