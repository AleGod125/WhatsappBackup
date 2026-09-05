import { SyncStatus } from '../../core/models/api.models';
/**
 * Que contarle al usuario cuando termina un ciclo.
 *
 * "Sincronización completada" a secas escondía el dato importante: que
 * decenas de conversaciones no se pudieron ni intentar porque WhatsApp aún no
 * ha dado una referencia con la que pedirles historial. Eso NO es un error, y
 * tampoco es una sincronización completa.
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
  if (s?.newSeeds) {
    partes.push(
      `${s.newSeeds} referencia${s.newSeeds === 1 ? '' : 's'} nueva${s.newSeeds === 1 ? '' : 's'}.`,
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
