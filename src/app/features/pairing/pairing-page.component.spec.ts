import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RealtimeService } from '../../core/events/realtime.service';
import { RealtimeEnvelope } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { PairingPageComponent } from './pairing-page.component';

function setup(
  options: {
    sessionState?: string;
    connected?: boolean;
    qr?: Array<{ available: boolean; generation?: number; expiresInSeconds?: number }>;
  } = {},
) {
  const events = new Subject<RealtimeEnvelope>();
  const qrValues = [...(options.qr ?? [{ available: true, generation: 3, expiresInSeconds: 300 }])];
  const session = {
    getSession: vi.fn(() =>
      of({
        state: options.sessionState ?? 'QR_READY',
        connected: options.connected ?? false,
        whatsappEnabled: true,
        qrAvailable: options.sessionState === 'QR_READY',
      }),
    ),
    qr: vi.fn(() => of(qrValues.length > 1 ? qrValues.shift()! : qrValues[0])),
    pair: vi.fn(() => of({ state: 'PAIRING', connected: false })),
    qrImageUrl: vi.fn(
      (generation: number) =>
        `http://127.0.0.1:5000/api/v1/session/qr/image?generation=${generation}&size=560`,
    ),
  };
  const router = { navigateByUrl: vi.fn() };
  TestBed.configureTestingModule({
    imports: [PairingPageComponent],
    providers: [
      { provide: SessionService, useValue: session },
      { provide: RealtimeService, useValue: { connect: vi.fn(), events$: events } },
      { provide: Router, useValue: router },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: { get: () => null } } },
      },
    ],
  });
  const fixture: ComponentFixture<PairingPageComponent> =
    TestBed.createComponent(PairingPageComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, session, events, router };
}

describe('PairingPageComponent REST bootstrap', () => {
  it('discovers a QR that existed before Angular opened', () => {
    const { fixture, component, session } = setup();
    expect(session.getSession).toHaveBeenCalledTimes(1);
    expect(session.qr).toHaveBeenCalledTimes(1);
    expect(component.generation()).toBe(3);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('.qr img') as HTMLImageElement).src).toContain(
      'generation=3&size=560',
    );
    fixture.destroy();
  });

  it('rotates to the generation received later by SSE', () => {
    const { component, events, fixture } = setup();
    events.next({
      type: 'session.qr',
      data: { available: true, generation: 4, expires_in_seconds: 250 },
    });
    expect(component.generation()).toBe(4);
    expect(component.qrUrl()).toContain('generation=4&size=560');
    fixture.destroy();
  });

  it('uses rescue polling when SSE never arrives', () => {
    vi.useFakeTimers();
    const { component, session, fixture } = setup({
      sessionState: 'PAIRING',
      qr: [{ available: false }, { available: true, generation: 8, expiresInSeconds: 200 }],
    });
    expect(component.qrUrl()).toBeUndefined();
    vi.advanceTimersByTime(4000);
    expect(session.qr).toHaveBeenCalledTimes(2);
    expect(component.generation()).toBe(8);
    fixture.destroy();
    vi.useRealTimers();
  });

  it('recovers from an expired image by reading newer metadata', () => {
    const { component, session, fixture } = setup({
      qr: [
        { available: true, generation: 3, expiresInSeconds: 200 },
        { available: true, generation: 4, expiresInSeconds: 200 },
      ],
    });
    component.onQrImageError();
    expect(session.qr).toHaveBeenCalledTimes(2);
    expect(component.generation()).toBe(4);
    expect(component.viewState()).toBe('qr_ready');
    fixture.destroy();
  });

  it('checks backend metadata when countdown reaches zero', () => {
    vi.useFakeTimers();
    const { component, session, fixture } = setup({
      qr: [
        { available: true, generation: 3, expiresInSeconds: 1 },
        { available: true, generation: 4, expiresInSeconds: 200 },
      ],
    });
    vi.advanceTimersByTime(1000);
    expect(session.qr).toHaveBeenCalledTimes(2);
    expect(component.generation()).toBe(4);
    expect(component.viewState()).toBe('qr_ready');
    fixture.destroy();
    vi.useRealTimers();
  });

  it('POSTs pair and then reads QR metadata on retry', () => {
    const { component, session, fixture } = setup({
      sessionState: 'PAIRING',
      qr: [{ available: false }, { available: true, generation: 9, expiresInSeconds: 200 }],
    });
    component.retryPairing();
    expect(session.pair).toHaveBeenCalledTimes(1);
    expect(session.qr).toHaveBeenCalledTimes(2);
    expect(component.generation()).toBe(9);
    fixture.destroy();
  });

  it('redirects when the initial session is already connected', () => {
    vi.useFakeTimers();
    const { session, router, fixture } = setup({ sessionState: 'CONNECTED', connected: true });
    expect(session.qr).not.toHaveBeenCalled();
    vi.advanceTimersByTime(750);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard', { replaceUrl: true });
    fixture.destroy();
    vi.useRealTimers();
  });
});
