import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Message } from '../../../core/models/api.models';
import { MessageService } from '../../../core/services/message.service';
import { SyncService } from '../../../core/services/sync.service';
import { WebBootstrapService } from '../../../core/services/web-bootstrap.service';
import { ConversationComponent } from './conversation.component';

const message = (id: string): Message => ({
  id,
  chatId: 'chat-1',
  type: 'image',
  timestamp: '2026-09-02T12:00:00Z',
  fromMe: false,
  media: { id: `media-${id}`, status: 'pending' },
});

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
          provide: WebBootstrapService,
          useValue: { recoverChat: () => of({ state: 'starting', qrRequired: false }) },
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
    expect(fixture.nativeElement.textContent).toContain(
      'todavía no tiene un punto de recuperación',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'El historial de esta conversación aún no se ha recuperado.',
    );
    expect(fixture.nativeElement.textContent).toContain('Intentar recuperar historial');
    expect(fixture.nativeElement.textContent).not.toContain('Historial sincronizado');
  });
});
