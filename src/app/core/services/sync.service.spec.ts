import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SyncService, normalizeSyncStatus } from './sync.service';

describe('SyncService', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('starts a manual reconciliation with POST', () => {
    const service = TestBed.inject(SyncService);
    service.run().subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      'http://localhost:5000/api/v1/sync/run',
    );
    expect(request.request.method).toBe('POST');
    request.flush({ state: 'running' });
  });

  it('normalizes running and completion data from SSE', () => {
    expect(normalizeSyncStatus({ state: 'running' }).state).toBe('running');
    const complete = normalizeSyncStatus({ state: 'complete', messages_new: 57 });
    expect(complete.state).toBe('complete');
    expect(complete.messagesNew).toBe(57);
  });

  it('el adaptador lee el resumen que manda el backend', () => {
    const estado = normalizeSyncStatus({
      state: 'complete',
      summary: {
        chats_total: 40,
        with_cursor: 13,
        waiting_seed: 27,
        retried: 2,
        retry_pending: 1,
        recovered_messages: 0,
        new_seeds: 0,
        drive_pending: 0,
      },
    });

    expect(estado.summary).toEqual({
      chatsTotal: 40,
      withCursor: 13,
      waitingSeed: 27,
      retried: 2,
      retryPending: 1,
      recoveredMessages: 0,
      newSeeds: 0,
      drivePending: 0,
    });
  });

  it('sin resumen no se inventa uno', () => {
    expect(normalizeSyncStatus({ state: 'complete' }).summary).toBeUndefined();
  });
});
