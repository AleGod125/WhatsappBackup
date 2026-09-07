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
import {
  OnboardingService,
  normalizeOnboarding,
} from '../../core/services/onboarding.service';
import { DashboardPageComponent, hayQueVolverAVincular } from './dashboard-page.component';
import { OnboardingPanelComponent } from './onboarding/onboarding-panel.component';
import { Chat } from '../../core/models/api.models';

/**
 * La sesión principal manda; el segundo dispositivo espera.
 *
 * EL FALLO QUE FIJAN ESTAS PRUEBAS
 * --------------------------------
 * El servicio arrancó sin sesión y aun así apareció en pantalla el código
 * «Mejorar la recuperación», con el banner ambiguo «Conexión con WhatsApp
 * perdida». El usuario podía pasarse la tarde escaneando el código del
 * segundo dispositivo cuando el que hacía falta era el principal.
 *
 * Aquí se protege lo que ve el usuario: qué desaparece, qué aparece en su
 * lugar y que el cambio ocurra solo, sin recargar la página.
 */

const respuesta = (extra: Record<string, unknown> = {}) => ({
  phase: 'recovering_history',
  primary: { linked: true, reason: null, reconnecting: false, message: '' },
  web_companion: {
    enabled: true,
    running: true,
    ready: true,
    qr_available: false,
    qr_generation: 0,
    state: 'connected',
  },
  recovery: { seeds_applied: 0, chats_promoted: 0, attempts: 0 },
  counts: { chats_total: 41, waiting_seed: 3, pending: 1, fetching: 0, timeout: 3, exhausted: 34 },
  ...extra,
});

// ---------------------------------------------------------------------------
// El panel del segundo dispositivo
// ---------------------------------------------------------------------------

describe('Sin conexión principal, el segundo dispositivo desaparece', () => {
  let recibido: Record<string, unknown>;
  let vivo: { destroy: () => void } | undefined;

  beforeEach(() => {
    recibido = respuesta();
    TestBed.configureTestingModule({
      imports: [OnboardingPanelComponent],
      providers: [
        {
          provide: OnboardingService,
          useValue: { status: () => of(normalizeOnboarding(recibido)) },
        },
        {
          provide: WebCompanionService,
          useValue: { qrImageUrl: (g: number) => `/qr.png?generation=${g}` },
        },
      ],
    });
  });

  afterEach(() => {
    vivo?.destroy();
    vivo = undefined;
  });

  const montar = (datos: Record<string, unknown>) => {
    recibido = datos;
    const fixture = TestBed.createComponent(OnboardingPanelComponent);
    vivo = fixture;
    fixture.detectChanges();
    return fixture;
  };

  it('en pairing_primary el panel entero no ocupa sitio', () => {
    const fixture = montar(
      respuesta({
        phase: 'pairing_primary',
        primary: { linked: false, reason: 'NOT_CONNECTED', reconnecting: false },
      }),
    );
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('el código del segundo dispositivo NO se enseña aunque el backend lo tenga', () => {
    // El caso exacto que se midió: había código del segundo dispositivo
    // disponible, y ganaba a la falta del principal.
    const fixture = montar(
      respuesta({
        phase: 'pairing_primary',
        primary: { linked: false, reason: 'NOT_CONNECTED', reconnecting: false },
        web_companion: {
          enabled: true,
          running: true,
          ready: false,
          qr_available: true,
          qr_generation: 4,
          state: 'qr_required',
        },
      }),
    );
    expect(fixture.nativeElement.querySelector('.qr img')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Mejorar la recuperación');
  });

  it('reconectando tampoco se pide el segundo código', () => {
    const fixture = montar(
      respuesta({
        phase: 'reconnecting',
        primary: { linked: false, reason: 'RECONNECTING', reconnecting: true },
        web_companion: { enabled: true, running: true, ready: false, qr_available: true },
      }),
    );
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('con la principal lista el segundo código vuelve a aparecer', () => {
    const fixture = montar(
      respuesta({
        phase: 'pairing_web',
        web_companion: {
          enabled: true,
          running: true,
          ready: false,
          qr_available: true,
          qr_generation: 4,
          state: 'qr_required',
        },
      }),
    );
    expect(fixture.nativeElement.textContent).toContain('Mejorar la recuperación');
    const imagen = fixture.nativeElement.querySelector('.qr img') as HTMLImageElement;
    expect(imagen.src).toContain('generation=4');
  });
});

// ---------------------------------------------------------------------------
// Qué significa "hay que volver a vincular"
// ---------------------------------------------------------------------------

describe('Vincular otra vez NO es lo mismo que un corte', () => {
  it('sin sesión, hay que volver a vincular', () => {
    expect(hayQueVolverAVincular('NO_SESSION', false)).toBe(true);
    expect(hayQueVolverAVincular('PAIRING_REQUIRED', false)).toBe(true);
    expect(hayQueVolverAVincular('SESSION_INVALID', false)).toBe(true);
  });

  it('reconectando o conectando NO manda a vincular', () => {
    // Las credenciales siguen valiendo y el runtime está volviendo solo:
    // enseñar el código haría rehacer algo que no está roto.
    expect(hayQueVolverAVincular('CONNECTING', false)).toBe(false);
    expect(hayQueVolverAVincular('DISCONNECTED', false)).toBe(false);
    expect(hayQueVolverAVincular('STARTING', false)).toBe(false);
  });

  it('conectado nunca manda a vincular', () => {
    expect(hayQueVolverAVincular('NO_SESSION', true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// El tablero: el aviso y la salida
// ---------------------------------------------------------------------------

const chat = (extra: Partial<Chat> = {}): Chat =>
  ({
    id: '1',
    jid: '5730111@s.whatsapp.net',
    displayName: 'Ana',
    messageCount: 0,
    historyStatus: 'waiting_seed',
    ...extra,
  }) as Chat;

function montarTablero(sesion: Record<string, unknown> = { connected: true }) {
  const connection = new Subject<'connected' | 'disconnected'>();
  const events = new Subject<{ type: string; data: unknown }>();
  const navigate = vi.fn();
  TestBed.configureTestingModule({
    imports: [DashboardPageComponent],
    providers: [
      { provide: ChatService, useValue: { list: () => of([chat()]), get: () => of(chat()) } },
      {
        provide: SyncService,
        useValue: { status: () => of({ connected: true, state: 'idle' }), run: () => of({}) },
      },
      {
        provide: SessionService,
        useValue: { health: () => of({ whatsappEnabled: true }), getSession: () => of(sesion) },
      },
      {
        provide: RealtimeService,
        useValue: { connect: vi.fn(), connection$: connection, events$: events, state: signal('LIVE') },
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
      { provide: Router, useValue: { navigate } },
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
  return { fixture, events, navigate, componente: fixture.componentInstance };
}

describe('El aviso dice qué hacer', () => {
  it('sin sesión, el aviso pide volver a vincular y ofrece la salida', () => {
    const { fixture } = montarTablero({ connected: false, state: 'NO_SESSION' });
    const texto = fixture.nativeElement.textContent;

    expect(texto).toContain('Necesitas volver a vincular WhatsApp para continuar');
    // Y no el ambiguo de antes, que servía para las dos cosas.
    expect(texto).not.toContain('Conexión con WhatsApp perdida');
    expect(fixture.nativeElement.querySelector('.connection-banner.relink button')).toBeTruthy();
  });

  it('el botón lleva al emparejamiento principal', () => {
    const { fixture, navigate } = montarTablero({ connected: false, state: 'NO_SESSION' });
    (
      fixture.nativeElement.querySelector('.connection-banner.relink button') as HTMLButtonElement
    ).click();

    expect(navigate).toHaveBeenCalledWith(['/pairing']);
  });

  it('un corte pasajero dice que se está reconectando, no que vincules', () => {
    const { fixture } = montarTablero({ connected: false, state: 'CONNECTING' });
    const texto = fixture.nativeElement.textContent;

    expect(texto).toContain('Conexión temporalmente perdida');
    expect(texto).not.toContain('volver a vincular');
  });

  it('sin conexión principal el panel del segundo dispositivo no está ni en avanzado', () => {
    const { fixture, componente } = montarTablero({ connected: false, state: 'NO_SESSION' });
    componente.advancedOpen.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-web-companion-panel')).toBeNull();
  });
});

describe('El cambio ocurre solo: sin F5', () => {
  it('si la sesión se cae en vivo, aparece el aviso de volver a vincular', () => {
    const { fixture, events } = montarTablero();
    expect(fixture.nativeElement.textContent).not.toContain('volver a vincular');

    events.next({ type: 'session.state', data: { state: 'NO_SESSION' } });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Necesitas volver a vincular WhatsApp para continuar',
    );
  });

  it('y el panel del segundo dispositivo desaparece en la misma vuelta', () => {
    const { fixture, events, componente } = montarTablero();
    componente.advancedOpen.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-web-companion-panel')).toBeTruthy();

    events.next({ type: 'session.state', data: { state: 'NO_SESSION' } });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-web-companion-panel')).toBeNull();
  });

  it('SI SE CAE LA SESION, SE SALE DEL PANEL: no se queda con un cartel', () => {
    // El fallo que cierra P0: se vio `/dashboard` cargado con el cartel de
    // «vuelve a vincular» dentro. Quedarse aqui es quedarse en una pantalla
    // que no puede funcionar —no hay chats que traer ni historial que pedir—
    // y lo unico que el usuario puede hacer, escanear, esta en /pairing.
    const { events, navigate } = montarTablero();
    expect(navigate).not.toHaveBeenCalled();

    events.next({ type: 'session.state', data: { state: 'NO_SESSION' } });

    expect(navigate).toHaveBeenCalledWith(['/pairing']);
  });

  it('un corte pasajero NO saca del panel', () => {
    // Sin esto, cada bache de red echaria al usuario a la pantalla del codigo
    // a rehacer algo que no esta roto.
    const { events, navigate } = montarTablero();

    events.next({ type: 'session.state', data: { state: 'CONNECTING' } });
    events.next({ type: 'session.state', data: { state: 'DISCONNECTED' } });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('cuando vuelve a conectar, el aviso se va solo', () => {
    const { fixture, events } = montarTablero({ connected: false, state: 'NO_SESSION' });
    expect(fixture.nativeElement.textContent).toContain('volver a vincular');

    events.next({ type: 'session.state', data: { state: 'CONNECTED' } });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('volver a vincular');
    expect(fixture.nativeElement.textContent).not.toContain('Conexión temporalmente perdida');
  });
});
