import { SyncStatus } from '../../core/models/api.models';
/**
 * Que contarle al usuario cuando termina un ciclo.
 *
 * "Sincronización completada" a secas escondía el dato importante: que
 * decenas de conversaciones no se pudieron ni intentar porque WhatsApp aún no
 * ha dado una referencia con la que pedirles historial. Eso NO es un error, y
 * tampoco es una sincronización completa.
 *
 * Y el número que se enseñaba tampoco ayudaba. El ciclo anunciaba «3410
 * referencias nuevas» mientras las conversaciones desatascadas eran **cero**:
 * las 3410 eran reales, pero salían de excavar ocho conversaciones que ya
 * funcionaban. Contarlas como logro era prometer un avance inexistente.
 *
 * Así que lo primero que se dice ahora es cuántas conversaciones se
 * desatascaron. Si no se desatascó ninguna, se dice eso.
 */
export function resumenDeSync(value?: SyncStatus): string {
  const s = value?.summary;
  const nuevos = value?.messagesNew ?? s?.recoveredMessages ?? 0;
  const esperando = s?.waitingSeed ?? value?.waitingSeed ?? 0;
  const partes: string[] = [];
  partes.push('Sincronización terminada.');
  if ((s?.withCursor ?? 0) === 0 && esperando > 0) {
    partes.push('No hubo conversaciones con referencia para pedir historial.');
  } else {
    partes.push(
      nuevos > 0
        ? `Se recuperaron ${nuevos} mensaje${nuevos === 1 ? '' : 's'}.`
        : 'No hubo mensajes nuevos.',
    );
  }
  // Lo que de verdad contesta a "¿ha servido pulsar?".
  const r = value?.recovery;
  const desatascadas = r?.promoted ?? 0;
  if (desatascadas > 0) {
    partes.push(
      `${desatascadas} conversaci${desatascadas === 1 ? 'ón' : 'ones'} ya ${desatascadas === 1 ? 'puede' : 'pueden'} pedir su historial.`,
    );
  } else if (r && (r.waitingBefore ?? 0) > 0) {
    // Se buscó y no apareció ninguna referencia utilizable. Decirlo es más
    // útil que un «terminada» que suena a que algo avanzó.
    partes.push('No apareció ninguna referencia nueva con la que desatascar más conversaciones.');
  }
  // El recuento de referencias sigue estando: es un hecho y sirve para
  // diagnosticar. Lo que ya no hace es ir primero ni pasar por logro, porque
  // la mayoría salen de conversaciones que ya funcionaban.
  if (s?.newSeeds) {
    partes.push(
      `${s.newSeeds} referencia${s.newSeeds === 1 ? '' : 's'} nueva${s.newSeeds === 1 ? '' : 's'}.`,
    );
  }
  if (r?.newChats) {
    partes.push(
      `${r.newChats} conversaci${r.newChats === 1 ? 'ón nueva' : 'ones nuevas'}.`,
    );
  }
  if (s?.retryPending) {
    partes.push(
      `${s.retryPending} espera${s.retryPending === 1 ? '' : 'n'} su turno de reintento.`,
    );
  }
  if (esperando > 0) {
    partes.push(
      `${esperando} conversaci${esperando === 1 ? 'ón' : 'ones'} ${esperando === 1 ? 'sigue' : 'siguen'} esperando una referencia de WhatsApp.`,
    );
  }
  return partes.join(' ');
}
