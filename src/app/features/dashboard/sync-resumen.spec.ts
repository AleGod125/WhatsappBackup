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

/**
 * Lo que CAMBIO por haber pulsado.
 *
 * El ciclo llego a anunciar «3410 referencias nuevas» con **cero**
 * conversaciones desatascadas. Las 3410 eran de verdad, pero salian de
 * excavar ocho conversaciones que ya funcionaban: el numero grande sugeria un
 * avance que no existia.
 */
describe('El boton dice si sirvio de algo', () => {
  it('lo primero que cuenta es cuantas se desatascaron', () => {
    const texto = resumenDeSync({
      state: 'complete',
      messagesNew: 0,
      summary: { newSeeds: 3410, waitingSeed: 31 },
      recovery: { waitingBefore: 32, waitingAfter: 31, promoted: 1, seedsFound: 3410 },
    });

    expect(texto).toContain('1 conversación ya puede pedir su historial');
  });

  it('SI NO CAMBIO NADA, LO DICE', () => {
    // La regla que evita el «éxito» generico: se busco, no aparecio nada, y
    // eso es lo que hay que contar.
    const texto = resumenDeSync({
      state: 'complete',
      messagesNew: 0,
      summary: { newSeeds: 3410, waitingSeed: 32 },
      recovery: { waitingBefore: 32, waitingAfter: 32, promoted: 0, seedsFound: 3410 },
    });

    expect(texto).toContain('No apareció ninguna referencia nueva');
    expect(texto).toContain('32 conversaciones siguen esperando');
  });

  it('el recuento de referencias sigue estando, pero no va primero', () => {
    const texto = resumenDeSync({
      state: 'complete',
      messagesNew: 0,
      summary: { newSeeds: 3410, waitingSeed: 31 },
      recovery: { waitingBefore: 32, waitingAfter: 31, promoted: 1 },
    });

    expect(texto).toContain('3410 referencias nuevas');
    expect(texto.indexOf('ya puede pedir su historial')).toBeLessThan(
      texto.indexOf('3410 referencias nuevas'),
    );
  });

  it('cuenta las conversaciones nuevas descubiertas', () => {
    const texto = resumenDeSync({
      state: 'complete',
      messagesNew: 0,
      summary: { waitingSeed: 0 },
      recovery: { waitingBefore: 0, waitingAfter: 0, promoted: 0, newChats: 2 },
    });

    expect(texto).toContain('2 conversaciones nuevas');
  });

  it('sin el bloque nuevo el resumen de siempre no cambia', () => {
    const texto = resumenDeSync({
      state: 'complete',
      messagesNew: 12,
      summary: { waitingSeed: 0 },
    });

    expect(texto).toContain('12 mensajes');
    expect(texto).not.toContain('No apareció ninguna referencia');
  });
});

