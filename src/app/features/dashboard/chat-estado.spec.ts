import { Chat } from '../../core/models/api.models';
import { claveDeEstado, estadoDeChat, lineaDeLista } from './chat-estado';

/**
 * El estado de una conversación se decide UNA vez.
 *
 * El fallo que fijan estas pruebas era visible: la misma conversación decía
 * «Historial sincronizado» en la cabecera y «El historial de esta conversación
 * aún no se ha recuperado» en el centro. Dos frases opuestas sobre lo mismo.
 */
const chat = (extra: Partial<Chat> = {}): Chat =>
  ({
    id: '1',
    displayName: 'Ana',
    messageCount: 0,
    ...extra,
  }) as Chat;

describe('Estado de un chat', () => {
  it('con mensajes y sin nada pendiente, está sincronizado', () => {
    expect(claveDeEstado(chat({ historyStatus: 'exhausted', messageCount: 50 }))).toBe('SYNCED');
  });

  it('SIN mensajes y con el historial cerrado NO dice "sincronizado"', () => {
    // WhatsApp entregó todo lo que tenía y resultó ser nada. Es exacto, pero
    // llamarlo "sincronizado" sobre una pantalla vacía hace pensar que falló.
    const presentacion = estadoDeChat(chat({ historyStatus: 'exhausted', messageCount: 0 }));
    expect(presentacion.estado).toBe('NO_MESSAGES_AVAILABLE');
    expect(presentacion.detalle).toContain('No hay mensajes disponibles');
    expect(presentacion.etiqueta).not.toContain('sincronizado');
  });

  it('y ese caso NO es un error', () => {
    const presentacion = estadoDeChat(chat({ historyStatus: 'exhausted' }));
    expect(presentacion.estado).not.toBe('ERROR');
    expect(presentacion.detalle).not.toMatch(/error|fall/i);
  });

  it('un timeout es un reintento pendiente, no un fallo', () => {
    const presentacion = estadoDeChat(chat({ historyStatus: 'timeout', messageCount: 3 }));
    expect(presentacion.estado).toBe('RETRY_PENDING');
    expect(presentacion.detalle).toContain('Se reintentará automáticamente');
    expect(presentacion.reintentable).toBe(true);
  });

  it('sin referencia se dice que se espera una', () => {
    expect(claveDeEstado(chat({ historyStatus: 'waiting_seed' }))).toBe('WAITING_SEED');
    expect(claveDeEstado(chat({ waitingSeed: true }))).toBe('WAITING_SEED');
    expect(claveDeEstado(chat({ historyStatus: 'no_valid_cursor' }))).toBe('WAITING_SEED');
  });

  it('mientras excava se dice que está recuperando', () => {
    const presentacion = estadoDeChat(chat({ historyStatus: 'fetching' }));
    expect(presentacion.estado).toBe('RECOVERING');
    expect(presentacion.enCurso).toBe(true);
  });

  it('un tope de rondas NO es el final del historial', () => {
    // `server_limited` significa que la pasada llegó a su límite, no que el
    // teléfono haya dicho que no le queda nada.
    expect(claveDeEstado(chat({ historyStatus: 'server_limited', messageCount: 20 }))).toBe(
      'PENDING',
    );
  });

  it('el teléfono dormido afecta a los que esperaban turno', () => {
    expect(claveDeEstado(chat({ historyStatus: 'pending' }), true)).toBe('WAITING_FOR_PHONE');
    expect(claveDeEstado(chat({ historyStatus: 'timeout' }), true)).toBe('WAITING_FOR_PHONE');
  });

  it('pero no a los que ya están completos', () => {
    // Un chat terminado no espera al teléfono: no tiene nada que pedirle.
    expect(claveDeEstado(chat({ historyStatus: 'exhausted', messageCount: 9 }), true)).toBe(
      'SYNCED',
    );
  });

  it('el texto del teléfono dice qué hacer, no qué falló', () => {
    const presentacion = estadoDeChat(chat({ historyStatus: 'pending' }), true);
    expect(presentacion.detalle).toContain('Abre WhatsApp');
  });

  it('un error real sí se llama error', () => {
    expect(claveDeEstado(chat({ historyStatus: 'error' }))).toBe('ERROR');
  });
});

describe('La línea de la lista de chats', () => {
  it('con historial completo manda el último mensaje', () => {
    const linea = lineaDeLista(
      chat({ historyStatus: 'exhausted', messageCount: 12, preview: 'Nos vemos' }),
    );
    expect(linea).toBe('Nos vemos');
  });

  it('sin nada que enseñar, manda el estado', () => {
    expect(lineaDeLista(chat({ historyStatus: 'waiting_seed' }))).toBe('Esperando referencia');
  });

  it('mientras recupera se dice, aunque haya previa', () => {
    // Es información que cambia ahora mismo; la previa sigue ahí después.
    expect(lineaDeLista(chat({ historyStatus: 'fetching', preview: 'Hola' }))).toContain(
      'Recuperando',
    );
  });

  it('un chat vacío y cerrado no deja la línea en blanco', () => {
    expect(lineaDeLista(chat({ historyStatus: 'exhausted', messageCount: 0 }))).toBe(
      'Sin mensajes disponibles',
    );
  });

  it('nunca devuelve undefined', () => {
    expect(typeof lineaDeLista(chat())).toBe('string');
  });
});
