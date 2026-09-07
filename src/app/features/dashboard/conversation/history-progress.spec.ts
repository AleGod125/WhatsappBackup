import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { HistoryProgressService } from './history-progress';
import { ApiClientService } from '../../../core/api/api-client.service';
import { RealtimeService } from '../../../core/events/realtime.service';
import { RealtimeEnvelope } from '../../../core/models/api.models';

/**
 * El estado de recuperación de la conversación abierta.
 *
 * QUE SE PROTEGE
 * --------------
 * Tres cosas que se rompen solas si nadie las fija:
 *
 * 1. **el spinner no gira para siempre.** Si WhatsApp no ha dado una
 *    referencia de esa conversación, no se puede pedir su pasado. Girar
 *    fingiendo trabajo es mentir; hay un estado con nombre para eso.
 * 2. **un evento de otra conversación no muta la que se está mirando.**
 *    Cambiar de chat rápido pintaba el progreso de A dentro de B.
 * 3. **una reconexión del canal no cuenta el mismo lote dos veces.**
 */
describe('Progreso del historial', () => {
  let eventos: Subject<RealtimeEnvelope>;
  let post: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eventos = new Subject<RealtimeEnvelope>();
    post = vi.fn(() => of({ prioritized: true }));

    TestBed.configureTestingModule({
      providers: [
        HistoryProgressService,
        { provide: ApiClientService, useValue: { post } },
        { provide: RealtimeService, useValue: { events$: eventos.asObservable() } },
      ],
    });
  });

  const servicio = () => TestBed.inject(HistoryProgressService);

  const avisar = (type: string, data: Record<string, unknown>) =>
    eventos.next({ type, data } as RealtimeEnvelope);

  it('sin conversación abierta no enseña nada', () => {
    expect(servicio().visible()).toBe(false);
  });

  it('seguir una conversación pide su prioridad', () => {
    servicio().seguir(7).subscribe();
    expect(post).toHaveBeenCalledWith('/chats/7/history/priority', {});
  });

  it('el progreso suma mensajes y se ve', () => {
    const s = servicio();
    s.seguir(7).subscribe();
    // Dos lotes REALES del mismo tamano. Con un hash del contenido el segundo
    // se habria descartado; por eso el aviso lleva numero de orden.
    avisar('history.chat.progress', { chat_id: 7, messages_added: 50, seq: 1 });
    avisar('history.chat.progress', { chat_id: 7, messages_added: 50, seq: 2 });
    expect(s.recuperados()).toBe(100);
    expect(s.estado()).toBe('recuperando');
    expect(s.visible()).toBe(true);
  });

  it('UN EVENTO DE OTRA CONVERSACION NO TOCA LA ABIERTA', () => {
    const s = servicio();
    s.seguir(7).subscribe();
    avisar('history.chat.progress', { chat_id: 99, messages_added: 500 });
    expect(s.recuperados()).toBe(0);
    expect(s.estado()).toBe('inactivo');
  });

  it('cambiar de conversación limpia el estado anterior', () => {
    const s = servicio();
    s.seguir(7).subscribe();
    avisar('history.chat.progress', { chat_id: 7, messages_added: 50, seq: 1 });
    expect(s.recuperados()).toBe(50);

    s.seguir(8).subscribe();
    expect(s.recuperados()).toBe(0);
    // Y un evento tardío del anterior ya no entra.
    avisar('history.chat.progress', { chat_id: 7, messages_added: 50 });
    expect(s.recuperados()).toBe(0);
  });

  it('un lote repetido no se cuenta dos veces', () => {
    const s = servicio();
    s.seguir(7).subscribe();
    // El MISMO aviso, reenviado por una reconexion del canal: mismo orden.
    const mismo = { chat_id: 7, messages_added: 50, seq: 1 };
    avisar('history.chat.progress', mismo);
    avisar('history.chat.progress', mismo);
    expect(s.recuperados()).toBe(50);
  });

  it('esperando referencia NO gira: no hay nada que esperar girando', () => {
    const s = servicio();
    s.seguir(7).subscribe();
    avisar('history.chat.waiting_seed', { chat_id: 7 });
    expect(s.estado()).toBe('esperando_referencia');
    expect(s.visible()).toBe(true);
    expect(s.girando()).toBe(false);
  });

  it('mientras recupera o reintenta, sí gira', () => {
    const s = servicio();
    s.seguir(7).subscribe();
    avisar('history.chat.started', { chat_id: 7 });
    expect(s.girando()).toBe(true);
    avisar('history.chat.retrying', { chat_id: 7 });
    expect(s.estado()).toBe('reintentando');
    expect(s.girando()).toBe(true);
  });

  it('al completar deja de girar', () => {
    const s = servicio();
    s.seguir(7).subscribe();
    avisar('history.chat.started', { chat_id: 7 });
    avisar('history.chat.completed', { chat_id: 7 });
    expect(s.estado()).toBe('completado');
    expect(s.girando()).toBe(false);
  });

  it('un error se recuerda con su motivo', () => {
    const s = servicio();
    s.seguir(7).subscribe();
    avisar('history.chat.error', { chat_id: 7, error: 'sin respuesta' });
    expect(s.estado()).toBe('error');
    expect(s.ultimoError()).toBe('sin respuesta');
  });

  it('la respuesta del endpoint decide el estado inicial', () => {
    const s = servicio();
    s.aplicarRespuesta({ waiting_seed: true });
    expect(s.estado()).toBe('esperando_referencia');
    s.aplicarRespuesta({ state: 'exhausted' });
    expect(s.estado()).toBe('completado');
    s.aplicarRespuesta({ waiting_seed: false, state: 'pending' });
    expect(s.estado()).toBe('recuperando');
  });

  it('soltar la conversación apaga el indicador', () => {
    const s = servicio();
    s.seguir(7).subscribe();
    avisar('history.chat.started', { chat_id: 7 });
    s.soltar();
    expect(s.visible()).toBe(false);
    // Y ya no le afecta nada.
    avisar('history.chat.progress', { chat_id: 7, messages_added: 50 });
    expect(s.recuperados()).toBe(0);
  });

  it('EL ID LLEGA COMO ENTERO Y EL MODELO USA CADENA', () => {
    // El backend manda `chat_id` entero; el modelo del frontend guarda el id
    // como cadena. Comparar sin normalizar (`1 !== '1'`) descartaba TODOS los
    // eventos en silencio: el indicador no se movia y no habia ni un error.
    const s = servicio();
    s.seguir('7').subscribe();
    avisar('history.chat.progress', { chat_id: 7, messages_added: 50, seq: 1 });
    expect(s.recuperados()).toBe(50);
  });

  it('avisa de cada lote para que la vista traiga los mensajes', () => {
    // Contar no basta: sin este aviso el indicador decia «+50» y arriba no
    // aparecia ni un mensaje hasta recargar.
    const s = servicio();
    const avisados: string[] = [];
    s.lotes$.subscribe((id) => avisados.push(id));
    s.seguir(7).subscribe();
    avisar('history.chat.progress', { chat_id: 7, messages_added: 50, seq: 1 });
    avisar('history.chat.progress', { chat_id: 7, messages_added: 50, seq: 2 });
    expect(avisados).toEqual(['7', '7']);
  });

  it('un evento desconocido no rompe nada', () => {
    const s = servicio();
    s.seguir(7).subscribe();
    avisar('chat.updated', { chat_id: 7 });
    expect(s.estado()).toBe('inactivo');
  });
});
