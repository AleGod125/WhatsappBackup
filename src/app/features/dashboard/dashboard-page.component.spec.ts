import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { RealtimeService } from '../../core/events/realtime.service';
import { ChatService } from '../../core/services/chat.service';
import { SessionService } from '../../core/services/session.service';
import { SyncService } from '../../core/services/sync.service';
import { HistoryRecheckService } from '../../core/services/history-recheck.service';
import { DashboardPageComponent } from './dashboard-page.component';

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

describe('Dashboard SSE reconnection', () => {
  it('reconciles chats through REST after EventSource reconnects', () => {
    const connection = new Subject<'connected' | 'disconnected'>();
    const events = new Subject<{ type: string; data: unknown }>();
    const chats = { list: vi.fn(() => of([])), get: vi.fn() };
    TestBed.configureTestingModule({
      imports: [DashboardPageComponent],
      providers: [
        { provide: ChatService, useValue: chats },
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
        {
          provide: HistoryRecheckService,
          useValue: { recheckPending: () => of(TRABAJO_VACIO) },
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
    expect(chats.list).toHaveBeenCalledTimes(1);
    connection.next('disconnected');
    expect(fixture.componentInstance.reconnecting()).toBe(true);
    connection.next('connected');
    expect(chats.list).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.reconnecting()).toBe(false);
  });
});
