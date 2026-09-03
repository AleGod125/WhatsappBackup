import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WebBootstrapService, normalizeRecoveryCommand } from './web-bootstrap.service';

describe('WebBootstrapService final recovery endpoints', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('uses only the individual final endpoint', () => {
    TestBed.inject(WebBootstrapService).recoverChat(9).subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      'http://127.0.0.1:5000/api/v1/chats/9/history/recover',
    );
    expect(request.request.method).toBe('POST');
    request.flush({ state: 'starting' });
  });
  it('uses only the global final endpoint', () => {
    TestBed.inject(WebBootstrapService).recoverPending().subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      'http://127.0.0.1:5000/api/v1/history/web-bootstrap/recover-pending',
    );
    expect(request.request.method).toBe('POST');
    request.flush({ state: 'starting' });
  });
  it('maps auxiliary QR requirements', () =>
    expect(normalizeRecoveryCommand({ state: 'qr_required', qr_available: true })).toEqual(
      expect.objectContaining({ state: 'qr_required', qrRequired: true }),
    ));
});
