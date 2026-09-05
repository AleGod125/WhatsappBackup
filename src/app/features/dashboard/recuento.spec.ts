import { Chat } from '../../core/models/api.models';
import { contar, preparandose, quedaTrabajo } from './recuento';

/**
 * Los contadores.
 *
 * EL PROBLEMA QUE FIJAN ESTAS PRUEBAS
 * -----------------------------------
 * La pantalla llegó a decir «43 chats pendientes» sobre 51 conversaciones,
 * cuando 37 de esas 43 se estaban recuperando en ese momento. El usuario leía
 * 43 fallos donde había trabajo en curso.
 *
 * Aquí se comprueba que cada situación se cuenta por separado y que nada se
 * suma con nada.
 */

const chat = (extra: Partial<Chat> = {}): Chat =>
  ({ id: '1', jid: 'x@s.whatsapp.net', messageCount: 10, historyStatus: 'exhausted', ...extra }) as Chat;

describe('Recuento: cada cosa en su casilla', () => {
  it('lo terminado cuenta como recuperado', () => {
    const r = contar([chat({ historyStatus: 'exhausted', messageCount: 250 })]);
    expect(r.recuperados).toBe(1);
    expect(r.recuperandose).toBe(0);
  });

  it('lo que se está pidiendo AHORA no es un fallo', () => {
    const r = contar([
      chat({ historyStatus: 'fetching' }),
      chat({ id: '2', historyStatus: 'pending' }),
    ]);
    expect(r.recuperandose).toBe(2);
    expect(r.error).toBe(0);
  });

  it('un reintento pendiente se cuenta aparte de lo que espera referencia', () => {
    const r = contar([
      chat({ historyStatus: 'timeout' }),
      chat({ id: '2', historyStatus: 'waiting_seed', messageCount: 0 }),
    ]);
    expect(r.reintentando).toBe(1);
    expect(r.esperandoReferencia).toBe(1);
  });

  it('terminado y sin nada dentro es «sin mensajes», no un error', () => {
    const r = contar([chat({ historyStatus: 'exhausted', messageCount: 0 })]);
    expect(r.sinMensajes).toBe(1);
    expect(r.error).toBe(0);
  });

  it('un error sí es un error', () => {
    expect(contar([chat({ historyStatus: 'error' })]).error).toBe(1);
  });

  it('el caso medido: 51 conversaciones, y NO son 43 problemas', () => {
    const chats = [
      ...Array.from({ length: 35 }, (_, i) =>
        chat({ id: `s${i}`, historyStatus: 'exhausted', messageCount: 100 }),
      ),
      ...Array.from({ length: 10 }, (_, i) => chat({ id: `f${i}`, historyStatus: 'fetching' })),
      ...Array.from({ length: 6 }, (_, i) =>
        chat({ id: `w${i}`, historyStatus: 'waiting_seed', messageCount: 0 }),
      ),
    ];
    const r = contar(chats);

    expect(r.total).toBe(51);
    expect(r.recuperados).toBe(35);
    expect(r.recuperandose).toBe(10);
    expect(r.esperandoReferencia).toBe(6);
    // Y ningún número dice «43».
    expect(r.error).toBe(0);
  });
});

describe('Recuento: si queda trabajo', () => {
  it('con todo terminado no queda nada', () => {
    expect(quedaTrabajo(contar([chat({ messageCount: 5 })]))).toBe(false);
  });

  it('«sin mensajes disponibles» NO deja la copia incompleta para siempre', () => {
    // El servidor contestó y no había nada: está tan terminada como una
    // sincronizada. Contarla como pendiente sería marcar la copia incompleta
    // por conversaciones que nunca van a tener nada.
    const r = contar([chat({ historyStatus: 'exhausted', messageCount: 0 })]);
    expect(quedaTrabajo(r)).toBe(false);
  });

  it('lo que se está recuperando sí cuenta como trabajo', () => {
    expect(quedaTrabajo(contar([chat({ historyStatus: 'fetching' })]))).toBe(true);
  });
});

describe('Recuento: cuándo se explica la espera', () => {
  it('con una carga fuerte se avisa', () => {
    const chats = Array.from({ length: 8 }, (_, i) => chat({ id: `f${i}`, historyStatus: 'fetching' }));
    expect(preparandose(contar(chats))).toBe(true);
  });

  it('con una o dos en curso no hace falta cartel: se ve solo', () => {
    const chats = [
      chat({ historyStatus: 'fetching' }),
      chat({ id: '2', historyStatus: 'exhausted', messageCount: 9 }),
    ];
    expect(preparandose(contar(chats))).toBe(false);
  });

  it('sin conversaciones no se avisa de nada', () => {
    expect(preparandose(contar([]))).toBe(false);
  });
});
