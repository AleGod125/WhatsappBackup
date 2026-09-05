import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RealtimeService } from '../../core/events/realtime.service';
import { OnboardingStatus, RealtimeEnvelope } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { SessionService } from '../../core/services/session.service';
import { PairingPageComponent } from './pairing-page.component';

/** Lo que responde el backend cuando toca vincular. */
const TOCA_VINCULAR: OnboardingStatus = {
  authenticated: true,
  googleConnected: true,
  driveAuthorized: true,
  whatsappLinked: false,
  nextStep: 'pairing',
};

function setup(
  options: {
    sessionState?: string;
    connected?: boolean;
    qr?: Array<{ available: boolean; generation?: number; expiresInSeconds?: number }>;
    onboarding?: OnboardingStatus;
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
        `http://localhost:5000/api/v1/session/qr/image?generation=${generation}&size=560`,
    ),
  };
  // La pantalla pregunta primero si de verdad toca vincular: recargarla con
  // la cuenta ya vinculada no puede arrancar otra sesión.
  const auth = { onboarding: vi.fn(() => of(options.onboarding ?? TOCA_VINCULAR)) };
  const router = { navigateByUrl: vi.fn() };
  TestBed.configureTestingModule({
    imports: [PairingPageComponent],
    providers: [
      { provide: SessionService, useValue: session },
      { provide: AuthService, useValue: auth },
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
  return { fixture, component: fixture.componentInstance, session, events, router, auth };
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

  it('el sondeo rescata el QR si el SSE no llega', () => {
    // Al pedir la vinculación el backend responde 202 y el código tarda un
    // instante en existir. Si el SSE se pierde, el sondeo lo recoge igual.
    vi.useFakeTimers();
    const { component, session, fixture } = setup({
      sessionState: 'PAIRING',
      qr: [
        { available: false }, // al entrar
        { available: false }, // justo tras pedir la vinculación
        { available: true, generation: 8, expiresInSeconds: 200 }, // sondeo
      ],
    });
    expect(component.qrUrl()).toBeUndefined();

    vi.advanceTimersByTime(4000);
    expect(component.generation()).toBe(8);
    expect(component.viewState()).toBe('qr_ready');
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

  it('pide la vinculación al backend: ya no se genera sola', () => {
    // El backend dejó de crear un QR al arrancar. Una vinculación sin dueño
    // acaba en manos del primero que pase, así que ahora hay que pedirla y el
    // servidor la asocia al usuario de la cookie.
    const { component, session, fixture } = setup({
      sessionState: 'PAIRING',
      qr: [{ available: false }, { available: true, generation: 9, expiresInSeconds: 200 }],
    });
    // Una al entrar (no había QR) y otra al pulsar "reintentar".
    expect(session.pair).toHaveBeenCalledTimes(1);

    component.retryPairing();
    expect(session.pair).toHaveBeenCalledTimes(2);
    expect(component.generation()).toBe(9);
    fixture.destroy();
  });

  it('con la sesión ya conectada, confirma con el backend y sale', () => {
    // No se navega solo porque el socket diga CONNECTED: se pregunta a
    // /onboarding/status. La cuenta puede no constar vinculada todavía, y
    // entrar al panel un instante antes muestra un panel vacío.
    vi.useFakeTimers();
    const { session, router, auth, fixture } = setup({
      sessionState: 'CONNECTED',
      connected: true,
      onboarding: {
        authenticated: true,
        googleConnected: true,
        driveAuthorized: true,
        whatsappLinked: true,
        nextStep: 'dashboard',
      },
    });
    expect(session.qr).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(auth.onboarding).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    fixture.destroy();
    vi.useRealTimers();
  });
});
