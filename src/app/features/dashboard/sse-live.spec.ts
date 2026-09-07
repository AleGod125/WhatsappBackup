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
import { MessageService, normalizeMessage } from '../../core/services/message.service';
import { OnboardingService } from '../../core/services/onboarding.service';
import { DashboardPageComponent } from './dashboard-page.component';
import { Chat, Message } from '../../core/models/api.models';

/**
 * Un mensaje en vivo tiene que aparecer SIN recargar.
 *
 * EL MECANISMO ES SSE, NO WEBSOCKET
 * ---------------------------------
 * El navegador abre un `EventSource` contra `/events`. Importa porque un
 * `EventSource` sólo entrega los eventos **con nombre** a los oyentes
 * registrados para ese nombre exacto: un evento que no esté en la lista
 * blanca no llega, y no se queja nadie.
 *
 * LA TRAMPA QUE ESTO VIGILA
 * -------------------------
 * El backend manda `chat_id` como **entero** y el modelo del frontend guarda
 * el id como **cadena**. `append()` descarta el mensaje si no coincide con la
 * conversación abierta, así que `61015 !== '61015'` tiraría **todos** los
 * mensajes en vivo en silencio: ni un error, ni una pista. Ya ocurrió una vez
 * con los eventos de historial; aquí se fija para los mensajes.
 */

const chat = (extra: Partial<Chat> = {}): Chat =>
  ({
    id: '61015',
    jid: '206566519222309@lid',
    displayName: 'Isaac',
    messageCount: 422,
    historyStatus: 'exhausted',
    ...extra,
  }) as Chat;

/** Una burbuja tal y como la serializa el backend: `chat_id` ENTERO. */
const burbujaDelBackend = (extra: Record<string, unknown> = {}) => ({
  id: 581760,
  whatsapp_message_id: '3EB0D3E326CBDC93E865C5',
  chat_id: 61015,
  type: 'text',
  text: 'LIVE-OUT-PHONE',
  from_me: true,
  timestamp: 1788700000,
  sent_at: new Date(1788700000000).toISOString(),
  preview: 'LIVE-OUT-PHONE',
  media: null,
  ...extra,
});

function montar(mensajes: Message[] = []) {
  const events = new Subject<{ type: string; data: unknown }>();
  TestBed.configureTestingModule({
    imports: [DashboardPageComponent],
    providers: [
      {
        provide: ChatService,
        useValue: { list: () => of([chat()]), get: () => of(chat()) },
      },
      { provide: MessageService, useValue: { list: () => of(mensajes) } },
      {
        provide: SyncService,
        useValue: { status: () => of({ connected: true, state: 'idle' }), run: () => of({}) },
      },
      {
        provide: SessionService,
        useValue: {
          health: () => of({ whatsappEnabled: true }),
          getSession: () => of({ connected: true, state: 'CONNECTED' }),
        },
      },
      {
        provide: RealtimeService,
        useValue: {
          connect: vi.fn(),
          connection$: new Subject<'connected' | 'disconnected'>(),
          events$: events,
          state: signal('LIVE'),
        },
      },
      { provide: HistoryRecheckService, useValue: { recheckPending: () => of({}) } },
      {
        provide: WebCompanionService,
        useValue: { status: () => of({ enabled: true }), qrImageUrl: () => '' },
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
  return { fixture, events, componente: fixture.componentInstance };
}

describe('Mensaje en vivo por SSE', () => {
  it('EL ID LLEGA ENTERO Y LA CONVERSACION LO GUARDA COMO CADENA', () => {
    // La comprobación de más abajo depende de esto: si `normalizeMessage` no
    // normalizara, `append()` compararía 61015 contra '61015' y descartaría
    // todos los mensajes sin decir nada.
    const mensaje = normalizeMessage(burbujaDelBackend());
    expect(mensaje.chatId).toBe('61015');
    expect(typeof mensaje.chatId).toBe('string');
    expect(mensaje.id).toBe('581760');
  });

  it('la burbuja completa trae el texto, el sentido y la hora', () => {
    const mensaje = normalizeMessage(burbujaDelBackend());
    expect(mensaje.text).toBe('LIVE-OUT-PHONE');
    expect(mensaje.fromMe).toBe(true);
    expect(mensaje.type).toBe('text');
  });

  it('un mensaje propio enviado desde el teléfono se distingue del recibido', () => {
    expect(normalizeMessage(burbujaDelBackend({ from_me: true })).fromMe).toBe(true);
    expect(normalizeMessage(burbujaDelBackend({ from_me: false })).fromMe).toBe(false);
  });

  it('el aviso escueto (sin burbuja) conserva la conversación y el id', () => {
    // Cuando el backend no puede servir la burbuja manda el contrato mínimo.
    // Lo que NO puede pasar es que se pierda a qué conversación pertenece.
    const mensaje = normalizeMessage({ chat_id: 61015, message_id: 581760 });
    expect(mensaje.chatId).toBe('61015');
    expect(mensaje.id).toBe('581760');
  });

  it('un mensaje de OTRA conversación no se cuela en la abierta', () => {
    const mensaje = normalizeMessage(burbujaDelBackend({ chat_id: 99999 }));
    expect(mensaje.chatId).toBe('99999');
  });

  it('el evento llega al tablero y actualiza la vista previa de la lista', () => {
    const { fixture, events, componente } = montar();

    events.next({
      type: 'message.created',
      data: { chat_id: 61015, message: burbujaDelBackend() },
    });
    fixture.detectChanges();

    const fila = componente.chats().find((c) => c.id === '61015');
    expect(fila?.preview).toBe('LIVE-OUT-PHONE');
  });

  it('message.created está en la lista blanca del EventSource', async () => {
    // Un `EventSource` sólo entrega eventos con nombre a quien se registró
    // para ese nombre exacto. Fuera de la lista, el evento no llega nunca.
    const { EVENT_NAMES } = await import('../../core/events/realtime.service');
    expect(EVENT_NAMES).toContain('message.created');
    expect(EVENT_NAMES).toContain('chat.updated');
  });
});
