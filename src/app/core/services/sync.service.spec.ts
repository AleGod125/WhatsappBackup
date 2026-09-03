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
      'http://127.0.0.1:5000/api/v1/sync/run',
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
});
