import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { OnboardingPanelComponent } from './onboarding-panel.component';
import { normalizeOnboarding, OnboardingService } from '../../../core/services/onboarding.service';
import { WebCompanionService } from '../../../core/services/web-companion.service';

/**
 * La puesta en marcha, contada sin lenguaje técnico.
 *
 * Lo que se protege aquí: que el segundo código aparezca cuando hace falta y
 * sólo entonces, que el panel desaparezca cuando ya no tiene nada que contar,
 * y que no diga «completo» mientras queden conversaciones por recuperar.
 */
const respuesta = (extra: Record<string, unknown> = {}) => ({
  phase: 'recovering_history',
  primary: { linked: true },
  web_companion: {
    enabled: true,
    running: true,
    ready: true,
    qr_available: false,
    qr_generation: 0,
    state: 'connected',
  },
  recovery: { seeds_applied: 0, chats_promoted: 0, attempts: 0 },
  counts: {
    chats_total: 41,
    waiting_seed: 3,
    pending: 1,
    fetching: 0,
    timeout: 3,
    exhausted: 34,
  },
  ...extra,
});

describe('Onboarding: lectura del backend', () => {
  it('una fase desconocida NO se muestra como terminada', () => {
    expect(normalizeOnboarding({ phase: 'algo_nuevo' }).phase).toBe('recovering_history');
  });

  it('nada se asume: sin datos, todo va a falso', () => {
    const s = normalizeOnboarding({});
    expect(s.primaryLinked).toBe(false);
    expect(s.web.enabled).toBe(false);
    expect(s.web.ready).toBe(false);
    expect(s.counts.chatsTotal).toBe(0);
  });

  it('lee los recuentos que deciden si esto terminó', () => {
    const s = normalizeOnboarding(respuesta());
    expect(s.counts.waitingSeed).toBe(3);
    expect(s.counts.exhausted).toBe(34);
    expect(s.counts.chatsTotal).toBe(41);
  });

  it('la cola sólo existe si el backend la manda', () => {
    expect(normalizeOnboarding(respuesta()).queue).toBeUndefined();
    const conCola = normalizeOnboarding(
      respuesta({ queue: { pending: 5, paused: true, waiting_for_phone: true, dug: 7 } }),
    );
    expect(conCola.queue?.waitingForPhone).toBe(true);
  });
});

describe('Onboarding: el panel', () => {
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

  // El panel se reprograma solo cada pocos segundos. Sin destruirlo, cada
  // prueba deja un temporizador vivo y al final del archivo hay veinte
  // componentes preguntando a la vez.
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

  it('terminado, el panel no ocupa sitio', () => {
    const fixture = montar(respuesta({ phase: 'complete' }));
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('si la recuperación completa está apagada, no dice nada', () => {
    const fixture = montar(
      respuesta({
        phase: 'partial',
        web_companion: { enabled: false, running: false, ready: false },
      }),
    );
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('cuando hace falta el segundo código, lo enseña como paso 2 de 2', () => {
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
    const texto = fixture.nativeElement.textContent;
    // Es una MEJORA, no un paso obligatorio: solo aparece si la sesión
    // principal no consiguió referencia para todas.
    expect(texto).toContain('Opcional');
    expect(texto).toContain('Mejorar la recuperación');
    const imagen = fixture.nativeElement.querySelector('.qr img') as HTMLImageElement;
    expect(imagen.src).toContain('generation=4');
  });

  it('explica para qué sirve el segundo vínculo, sin tecnicismos', () => {
    const fixture = montar(
      respuesta({
        phase: 'pairing_web',
        web_companion: { enabled: true, running: true, ready: false, qr_available: true },
      }),
    );
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('WhatsApp no entrega una referencia de cada conversación');
    for (const tecnico of ['LID', 'WAMID', 'Signal', 'protobuf', 'session_id']) {
      expect(texto).not.toContain(tecnico);
    }
  });

  it('si ya está vinculado no se pide ningún código', () => {
    const fixture = montar(respuesta());
    expect(fixture.nativeElement.querySelector('.qr img')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Mejorar la recuperación');
  });

  it('mientras recupera, cuenta el progreso en conversaciones', () => {
    const fixture = montar(respuesta());
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Recuperando tu historial');
    expect(texto).toContain('34 de 41 conversaciones');
    expect(texto).toContain('3 sin referencia');
  });

  it('mientras el companion arranca no se pide nada al usuario', () => {
    const fixture = montar(
      respuesta({
        phase: 'waiting_web',
        web_companion: { enabled: true, running: true, ready: false, qr_available: false },
      }),
    );
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Preparando la recuperación completa');
    expect(texto).toContain('No hace falta que hagas nada');
  });

  it('si el teléfono duerme, dice qué hacer y que no se pierde nada', () => {
    const fixture = montar(
      respuesta({
        phase: 'waiting_for_phone',
        queue: { pending: 8, paused: true, waiting_for_phone: true, dug: 12 },
      }),
    );
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Esperando al teléfono');
    expect(texto).toContain('Abre WhatsApp');
    expect(texto).toContain('progreso está guardado');
  });

  it('recuperación parcial dice cuántas quedan, sin llamarlo error', () => {
    const fixture = montar(respuesta({ phase: 'partial' }));
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Recuperación parcial');
    expect(texto).toContain('Quedan 3 conversaciones');
    expect(texto.toLowerCase()).not.toContain('error');
  });

  it('una sola conversación pendiente se escribe en singular', () => {
    const fixture = montar(
      respuesta({
        phase: 'partial',
        counts: {
          chats_total: 41,
          waiting_seed: 1,
          pending: 0,
          fetching: 0,
          timeout: 0,
          exhausted: 40,
        },
      }),
    );
    expect(fixture.nativeElement.textContent).toContain('Queda 1 conversación');
  });

  it('un fallo consultando el estado no rompe el panel', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OnboardingPanelComponent],
      providers: [
        {
          provide: OnboardingService,
          useValue: { status: () => throwError(() => new Error('sin red')) },
        },
        { provide: WebCompanionService, useValue: { qrImageUrl: () => '' } },
      ],
    });
    const fixture = TestBed.createComponent(OnboardingPanelComponent);
    vivo = fixture;
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it('el usuario no tiene que pulsar nada: el panel no ofrece acciones', () => {
    // La recuperación la dispara el backend solo. Un botón aquí sería volver
    // al flujo de laboratorio que se está quitando.
    const fixture = montar(respuesta());
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
  });
});
