import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { RealtimeService } from '../../core/events/realtime.service';
import { ChatService } from '../../core/services/chat.service';
import { SessionService } from '../../core/services/session.service';
import { SyncService } from '../../core/services/sync.service';
import { HistoryRecheckService } from '../../core/services/history-recheck.service';
import { WebCompanionService } from '../../core/services/web-companion.service';
import { OnboardingService } from '../../core/services/onboarding.service';
import { DashboardPageComponent } from './dashboard-page.component';
import { Chat } from '../../core/models/api.models';

/**
 * Que la pantalla se entere sin recargar.
 *
 * EL FALLO QUE FIJAN ESTAS PRUEBAS
 * --------------------------------
 * El backend cambiaba el estado de un chat y la pantalla seguía enseñando el
 * del momento en que se cargó. Un chat podía decir «Recuperando historial»
 * durante horas con el trabajo ya terminado, o mostrarse vacío mientras en la
 * base había tres mil mensajes suyos. La única salida era F5.
 *
 * La causa era doble: el backend no publicaba los cambios de estado, y de los
 * que sí publicaba (`history.progress`) el frontend no escuchaba ninguno.
 */
const TRABAJO_VACIO = {
  jobId: 'test',
  state: 'completed' as const,
  total: 0,
  processed: 0,
  recovered: 0,
  stillWaiting: 0,
  errors: 0,
  messagesRecovered: 0,
};

const chat = (extra: Partial<Chat> = {}): Chat =>
  ({
    id: '1',
    jid: '5730111@s.whatsapp.net',
    displayName: 'Ana',
    messageCount: 0,
    historyStatus: 'waiting_seed',
    ...extra,
  }) as Chat;

function montar(chatsIniciales: Chat[] = [chat()]) {
  const connection = new Subject<'connected' | 'disconnected'>();
  const events = new Subject<{ type: string; data: unknown }>();
  const list = vi.fn(() => of(chatsIniciales));
  TestBed.configureTestingModule({
    imports: [DashboardPageComponent],
    providers: [
      { provide: ChatService, useValue: { list, get: vi.fn(() => of(chatsIniciales[0])) } },
      {
        provide: SyncService,
        useValue: { status: () => of({ connected: true, state: 'idle' }), run: () => of({}) },
      },
      {
        provide: SessionService,
        useValue: {
          health: () => of({ whatsappEnabled: true }),
          getSession: () => of({ connected: true }),
        },
      },
      {
        provide: RealtimeService,
        useValue: { connect: vi.fn(), connection$: connection, events$: events, state: signal('LIVE') },
      },
      { provide: HistoryRecheckService, useValue: { recheckPending: () => of(TRABAJO_VACIO) } },
      {
        provide: WebCompanionService,
        useValue: { status: () => of({ enabled: false }), qrImageUrl: () => '' },
      },
      {
        provide: OnboardingService,
        useValue: { status: () => of({ phase: 'complete', web: {}, counts: {} }) },
      },
      { provide: Router, useValue: { navigate: vi.fn() } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: () => null }, queryParamMap: { get: () => null } },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DashboardPageComponent);
  fixture.detectChanges();
  return { fixture, events, list, componente: fixture.componentInstance };
}

describe('Realtime: el estado de un chat cambia sin F5', () => {
  it('un cambio de estado se aplica en la lista', () => {
    const { events, componente } = montar();
    expect(componente.chats()[0].historyStatus).toBe('waiting_seed');

    events.next({
      type: 'chat.status',
      data: { chat_jid: '5730111@s.whatsapp.net', history_status: 'fetching' },
    });

    expect(componente.chats()[0].historyStatus).toBe('fetching');
  });

  it('y NO va al servidor a buscarlo', () => {
    // Llega uno por cada transición y por cada chat de la tanda. Pedir la
    // lista entera en cada uno convertiría una excavación de cuarenta chats
    // en cuarenta peticiones.
    const { events, list } = montar();
    const antes = list.mock.calls.length;

    for (const estado of ['pending', 'fetching', 'exhausted']) {
      events.next({
        type: 'chat.status',
        data: { chat_jid: '5730111@s.whatsapp.net', history_status: estado },
      });
    }

    expect(list.mock.calls.length).toBe(antes);
  });

  it('el chat abierto también se actualiza', () => {
    const { events, componente } = montar();
    componente.selected.set(chat());

    events.next({
      type: 'chat.status',
      data: { chat_jid: '5730111@s.whatsapp.net', history_status: 'exhausted' },
    });

    expect(componente.selected()?.historyStatus).toBe('exhausted');
  });

  it('waiting_seed se refleja también en su bandera', () => {
    const { events, componente } = montar([chat({ historyStatus: 'pending' })]);
    events.next({
      type: 'chat.status',
      data: { chat_jid: '5730111@s.whatsapp.net', history_status: 'waiting_seed' },
    });
    expect(componente.chats()[0].waitingSeed).toBe(true);
  });

  it('un aviso de otro chat no toca al nuestro', () => {
    const { events, componente } = montar();
    events.next({
      type: 'chat.status',
      data: { chat_jid: 'otro@s.whatsapp.net', history_status: 'exhausted' },
    });
    expect(componente.chats()[0].historyStatus).toBe('waiting_seed');
  });

  it('un aviso incompleto se ignora en vez de romper la lista', () => {
    const { events, componente } = montar();
    events.next({ type: 'chat.status', data: { chat_jid: '' } });
    events.next({ type: 'chat.status', data: null });
    expect(componente.chats()[0].historyStatus).toBe('waiting_seed');
  });
});

describe('Realtime: los mensajes de historial', () => {
  it('una tormenta de avisos produce UNA sola recarga', () => {
    // Una excavación produce un aviso por cada bloque de cincuenta mensajes.
    // Sin agrupar, recuperar tres mil disparaba sesenta peticiones seguidas.
    vi.useFakeTimers();
    try {
      const { events, list } = montar();
      const antes = list.mock.calls.length;

      for (let i = 0; i < 60; i += 1) {
        events.next({
          type: 'history.progress',
          data: { chat_jids: ['5730111@s.whatsapp.net'], messages: 50 },
        });
      }
      expect(list.mock.calls.length).toBe(antes);

      vi.advanceTimersByTime(1000);
      expect(list.mock.calls.length).toBe(antes + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un aviso sin chats no dispara nada', () => {
    vi.useFakeTimers();
    try {
      const { events, list } = montar();
      const antes = list.mock.calls.length;
      events.next({ type: 'history.progress', data: { chat_jids: [] } });
      vi.advanceTimersByTime(2000);
      expect(list.mock.calls.length).toBe(antes);
    } finally {
      vi.useRealTimers();
    }
  });

  it('la recarga de fondo no enciende el indicador de carga', () => {
    // El usuario no ha pedido nada: ver desaparecer la lista y volver es peor
    // que no actualizarla.
    vi.useFakeTimers();
    try {
      const { events, componente } = montar();
      events.next({
        type: 'history.progress',
        data: { chat_jids: ['5730111@s.whatsapp.net'] },
      });
      vi.advanceTimersByTime(1000);
      expect(componente.loading()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Realtime: la multimedia no arrasa la lista', () => {
  it('cien avisos de multimedia no recargan la lista ni una vez', () => {
    // Una descarga de adjuntos produce cientos de estos. Reconstruir el
    // panel con cada uno lo dejaba inservible mientras durase.
    vi.useFakeTimers();
    try {
      const { events, list } = montar();
      const antes = list.mock.calls.length;

      for (let i = 0; i < 100; i += 1) {
        events.next({ type: 'media.updated', data: { message_id: `m${i}` } });
      }
      vi.advanceTimersByTime(3000);

      expect(list.mock.calls.length).toBe(antes);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Realtime: el índice de WhatsApp Web', () => {
  it('conversaciones nuevas obligan a pedir la lista, una sola vez', () => {
    // Estas sí necesitan el servidor: son chats que aquí no existían y no se
    // pueden construir con lo que el aviso trae.
    vi.useFakeTimers();
    try {
      const { events, list } = montar();
      const antes = list.mock.calls.length;

      events.next({
        type: 'chat.inventory',
        data: { web_inventory_total: 50, web_inventory_new: 9, chats_promoted: 9 },
      });
      events.next({
        type: 'chat.inventory',
        data: { web_inventory_total: 50, web_inventory_new: 9, chats_promoted: 9 },
      });
      vi.advanceTimersByTime(1000);

      expect(list.mock.calls.length).toBe(antes + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un índice que no encontró nada nuevo no recarga nada', () => {
    vi.useFakeTimers();
    try {
      const { events, list } = montar();
      const antes = list.mock.calls.length;
      events.next({
        type: 'chat.inventory',
        data: { web_inventory_total: 41, web_inventory_new: 0, chats_promoted: 0 },
      });
      vi.advanceTimersByTime(2000);
      expect(list.mock.calls.length).toBe(antes);
    } finally {
      vi.useRealTimers();
    }
  });

  it('se avisa de cuántas aparecieron, en singular y en plural', () => {
    const { events, componente } = montar();
    events.next({ type: 'chat.inventory', data: { web_inventory_new: 1 } });
    expect(componente.toast()).toContain('1 conversación nueva');

    events.next({ type: 'chat.inventory', data: { web_inventory_new: 9 } });
    expect(componente.toast()).toContain('9 conversaciones nuevas');
  });
});

// ---------------------------------------------------------------------------
// PLAN G: LO QUE SE DESCUBRE APARECE SOLO
// ---------------------------------------------------------------------------
//
// El fallo medido: WhatsApp Web descubría conversaciones, el backend las
// guardaba en PostgreSQL, y la pantalla seguía enseñando la lista del momento
// en que se cargó. La única salida era F5, y mientras tanto la aplicación
// parecía colgada aunque el backend estuviera trabajando.

const filaDeChat = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  jid: `${id}@s.whatsapp.net`,
  display_name: `Chat ${id}`,
  chat_type: 'individual',
  message_count: 0,
  history_status: 'waiting_seed',
  ...extra,
});

describe('Realtime: una conversación nueva aparece sin recargar', () => {
  it('llega con su fila entera y se inserta', () => {
    const { events, componente } = montar([chat()]);
    expect(componente.chats().length).toBe(1);

    events.next({ type: 'chat.created', data: { chat_id: 99, chat: filaDeChat('99') } });

    expect(componente.chats().length).toBe(2);
    expect(componente.chats().some((c) => c.id === '99')).toBe(true);
  });

  it('y NO se pide la lista para enterarse', () => {
    // Descubrir cincuenta conversaciones serían cincuenta peticiones.
    const { events, list } = montar();
    const antes = list.mock.calls.length;

    for (let i = 0; i < 20; i += 1) {
      events.next({
        type: 'chat.created',
        data: { chat_id: i, chat: filaDeChat(String(100 + i)) },
      });
    }

    expect(list.mock.calls.length).toBe(antes);
  });

  it('veinte conversaciones nuevas son veinte filas, no veinte duplicados', () => {
    const { events, componente } = montar([chat()]);
    for (let i = 0; i < 20; i += 1) {
      events.next({
        type: 'chat.created',
        data: { chat_id: i, chat: filaDeChat(String(100 + i)) },
      });
    }
    expect(componente.chats().length).toBe(21);
  });

  it('la misma conversación dos veces no se duplica: se actualiza', () => {
    const { events, componente } = montar([chat()]);

    events.next({ type: 'chat.created', data: { chat: filaDeChat('99') } });
    events.next({
      type: 'chat.updated',
      data: { chat: filaDeChat('99', { display_name: 'Ana' }) },
    });

    const iguales = componente.chats().filter((c) => c.id === '99');
    expect(iguales.length).toBe(1);
    expect(iguales[0].displayName).toBe('Ana');
  });

  it('la lista queda ordenada por actividad, la más reciente primero', () => {
    const { events, componente } = montar([
      chat({ id: '1', lastMessageTimestamp: 1000 } as Partial<Chat>),
    ]);

    events.next({
      type: 'chat.created',
      data: { chat: filaDeChat('2', { last_message_timestamp: 5000 }) },
    });
    events.next({
      type: 'chat.created',
      data: { chat: filaDeChat('3', { last_message_timestamp: 3000 }) },
    });

    expect(componente.chats().map((c) => c.id)).toEqual(['2', '3', '1']);
  });

  it('un aviso sin fila utilizable no rompe la lista', () => {
    const { events, componente } = montar([chat()]);
    events.next({ type: 'chat.created', data: {} });
    events.next({ type: 'chat.created', data: null });
    expect(componente.chats().length).toBe(1);
  });
});

describe('Realtime: el historial que entra actualiza en el sitio', () => {
  it('el contador y la previa cambian sin pedir la lista', () => {
    const { events, componente, list } = montar([chat({ messageCount: 0 })]);
    const antes = list.mock.calls.length;

    events.next({
      type: 'history.progress',
      data: {
        chat_jids: ['5730111@s.whatsapp.net'],
        messages: 50,
        chats: [
          filaDeChat('1', {
            jid: '5730111@s.whatsapp.net',
            message_count: 50,
            preview: 'hola',
            history_status: 'fetching',
          }),
        ],
      },
    });

    expect(componente.chats()[0].messageCount).toBe(50);
    expect(componente.chats()[0].historyStatus).toBe('fetching');
    // La fila venía dentro del aviso: no hay nada que preguntar.
    expect(list.mock.calls.length).toBe(antes);
  });

  it('sin filas dentro, se pide la lista UNA vez', () => {
    vi.useFakeTimers();
    try {
      const { events, list } = montar();
      const antes = list.mock.calls.length;

      for (let i = 0; i < 30; i += 1) {
        events.next({
          type: 'history.progress',
          data: { chat_jids: ['5730111@s.whatsapp.net'], messages: 50 },
        });
      }
      vi.advanceTimersByTime(2000);

      expect(list.mock.calls.length).toBe(antes + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Realtime: el estado por identificador', () => {
  it('un cambio de estado con chat_id encuentra la fila aunque el JID no case', () => {
    // Una conversación descubierta por LID puede estar en la lista con el JID
    // del teléfono: comparar cadenas fallaría justo ahí.
    const { events, componente } = montar([chat({ id: '7' })]);

    events.next({
      type: 'chat.status',
      data: { chat_id: 7, chat_jid: 'otro@lid', history_status: 'fetching' },
    });

    expect(componente.chats()[0].historyStatus).toBe('fetching');
  });
});
