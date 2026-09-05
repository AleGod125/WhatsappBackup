import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Message } from '../../../core/models/api.models';
import { MessageService } from '../../../core/services/message.service';
import { SyncService } from '../../../core/services/sync.service';
import { HistoryRecheckService } from '../../../core/services/history-recheck.service';
import { ConversationComponent } from './conversation.component';

const message = (id: string): Message => ({
  id,
  chatId: 'chat-1',
  type: 'image',
  timestamp: '2026-09-02T12:00:00Z',
  fromMe: false,
  media: { id: `media-${id}`, status: 'pending' },
});

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

describe('ConversationComponent realtime updates', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [ConversationComponent],
      providers: [
        {
          provide: MessageService,
          useValue: { list: () => of({ items: [message('a'), message('b')], hasMore: false }) },
        },
        { provide: SyncService, useValue: { run: () => of({}) } },
        {
          provide: HistoryRecheckService,
          useValue: { recheckChat: () => of(TRABAJO_VACIO) },
        },
      ],
    }),
  );
  function create() {
    const fixture = TestBed.createComponent(ConversationComponent);
    fixture.componentRef.setInput('chat', {
      id: 'chat-1',
      displayName: 'Chat',
      historyStatus: 'waiting_seed',
    });
    fixture.detectChanges();
    return fixture;
  }
  it('appends an SSE message once and deduplicates by id', () => {
    const fixture = create();
    const incoming = { ...message('c'), type: 'text' as const, text: 'Nuevo' };
    fixture.componentInstance.append(incoming);
    fixture.componentInstance.append(incoming);
    expect(fixture.componentInstance.messages().filter((item) => item.id === 'c')).toHaveLength(1);
  });
  it('media.updated changes only the target message', () => {
    const fixture = create();
    const untouched = fixture.componentInstance.messages()[1];
    fixture.componentInstance.updateMedia('a', {
      id: 'media-a',
      status: 'downloaded',
      fileUrl: '/a.jpg',
    });
    expect(fixture.componentInstance.messages()[0].media?.status).toBe('downloaded');
    expect(fixture.componentInstance.messages()[1]).toBe(untouched);
  });
  it('does not label waiting_seed as synchronized', () => {
    const fixture = create();
    fixture.componentInstance.messages.set([]);
    fixture.detectChanges();
    // El texto exacto vive en `chat-estado`; lo que esta prueba fija es que
    // un chat sin referencia NO se presenta como sincronizado.
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Esperando referencia');
    expect(texto).not.toContain('Historial sincronizado');
    // Y sigue ofreciendo reintentar: pendiente no es un final.
    // Se comprueba que el botón ESTÁ, no cómo se dice: el texto depende del
    // idioma, y fijarlo aquí ataría la prueba al castellano.
    expect(fixture.nativeElement.querySelector('.history-retry')).toBeTruthy();
    // El centro explica POR QUÉ está vacío, no repite la etiqueta corta de
    // la cabecera: son dos sitios con espacio distinto.
    expect(texto).toContain('Esperando una referencia para recuperar este chat');
    // Se comprueba que el botón ESTÁ, no cómo se dice: el texto depende del
    // idioma, y fijarlo aquí ataría la prueba al castellano.
    expect(fixture.nativeElement.querySelector('.history-retry')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Historial sincronizado');
  });
});
