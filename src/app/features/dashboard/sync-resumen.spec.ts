import { resumenDeSync } from './sync-resumen';

/**
 * El texto que ve el usuario cuando termina un ciclo.
 *
 * "Sincronización completada" a secas escondía el dato importante: que
 * decenas de conversaciones no se pudieron ni intentar porque WhatsApp aún no
 * ha dado una referencia con la que pedirles historial.
 */
describe('Resumen honesto de la sincronización', () => {
  it('no dice "completada" cuando quedan chats esperando', () => {
    const texto = resumenDeSync({
      state: 'complete',
      messagesNew: 0,
      summary: { withCursor: 0, waitingSeed: 27, recoveredMessages: 0, newSeeds: 0 },
    });

    expect(texto).toContain('Sincronización terminada');
    expect(texto).toContain('No hubo conversaciones con referencia para pedir historial');
    expect(texto).toContain('27 conversaciones');
    expect(texto).toContain('esperando una referencia de WhatsApp');
    expect(texto).not.toContain('completada');
  });

  it('cuenta los mensajes recuperados cuando los hay', () => {
    const texto = resumenDeSync({
      state: 'complete',
      messagesNew: 12,
      summary: { waitingSeed: 0 },
    });

    expect(texto).toContain('12 mensajes');
    expect(texto).not.toContain('esperando');
  });

  it('avisa de las referencias nuevas encontradas', () => {
    const texto = resumenDeSync({
      state: 'complete',
      messagesNew: 0,
      summary: { newSeeds: 1, waitingSeed: 26 },
    });

    expect(texto).toContain('1 referencia nueva');
  });

  it('distingue "espera su turno" de "no se puede pedir"', () => {
    const texto = resumenDeSync({
      state: 'complete',
      messagesNew: 0,
      summary: { retryPending: 2, waitingSeed: 27 },
    });

    expect(texto).toContain('2 esperan su turno de reintento');
    expect(texto).toContain('27 conversaciones siguen esperando');
  });

  it('un solo chat se escribe en singular', () => {
    const texto = resumenDeSync({
      state: 'complete',
      messagesNew: 0,
      summary: { waitingSeed: 1 },
    });

    expect(texto).toContain('1 conversación sigue esperando');
  });

  it('sin resumen del backend sigue diciendo algo cierto', () => {
    expect(resumenDeSync({ state: 'complete', messagesNew: 0 })).toContain(
      'No hubo mensajes nuevos',
    );
  });
});
