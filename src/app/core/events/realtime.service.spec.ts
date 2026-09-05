import { EVENT_NAMES, SILENCIO_MAXIMO_MS } from './realtime.service';

/**
 * El canal en tiempo real.
 *
 * EL FALLO QUE FIJAN ESTAS PRUEBAS
 * --------------------------------
 * `EventSource` entrega un evento **con nombre** sólo a quien se registró con
 * ese nombre exacto. La lista de nombres se había quedado corta —le faltaban
 * `chat.status`, `chat.inventory`, `chat.created` y `heartbeat`— así que el
 * backend los publicaba, el stream los transportaba y el navegador los tiraba.
 *
 * El panel tenía código para tratarlos que no podía ejecutarse nunca. Desde
 * fuera se veía como una aplicación congelada, y la única salida era F5.
 *
 * Una lista que hay que acordarse de actualizar se queda corta otra vez, así
 * que aquí se compara contra lo que el backend publica de verdad.
 */

/**
 * Lo que el backend manda por SSE. Sale de `EVENT_NAMES` de `app/api/routes.py`
 * y de los eventos enriquecidos de `app/api/live_events.py`.
 */
const LOS_QUE_MANDA_EL_BACKEND = [
  'session.state',
  'session.qr',
  'chat.created',
  'chat.updated',
  'chat.status',
  'chat.inventory',
  'message.created',
  'message.updated',
  'media.updated',
  'history.progress',
  'backfill.progress',
  'sync.status',
  'history.waiting_for_phone',
  'history.recovery_resumed',
  'history.web_seeds.started',
  'history.web_seeds.completed',
  'heartbeat',
];

describe('Realtime: a qué eventos nos suscribimos', () => {
  it('no falta ninguno de los que manda el backend', () => {
    const suscritos = new Set<string>(EVENT_NAMES);
    const faltan = LOS_QUE_MANDA_EL_BACKEND.filter((nombre) => !suscritos.has(nombre));

    expect(faltan).toEqual([]);
  });

  it('los cuatro que faltaban están', () => {
    // Nombrados uno a uno: son los que produjeron el fallo, y una prueba que
    // sólo compara conjuntos no diría cuál se volvió a perder.
    const suscritos = new Set<string>(EVENT_NAMES);
    for (const nombre of ['chat.status', 'chat.inventory', 'chat.created', 'heartbeat']) {
      expect(suscritos.has(nombre)).toBe(true);
    }
  });

  it('no hay nombres repetidos', () => {
    expect(new Set(EVENT_NAMES).size).toBe(EVENT_NAMES.length);
  });

  it('el silencio máximo tolerado deja margen a varios latidos', () => {
    // Ni tan corto que reconecte por un latido perdido, ni tan largo que la
    // pantalla se quede media hora enseñando algo que ya no es cierto.
    expect(SILENCIO_MAXIMO_MS).toBeGreaterThanOrEqual(30_000);
    expect(SILENCIO_MAXIMO_MS).toBeLessThanOrEqual(180_000);
  });
});
