import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  WebCompanionPanelComponent,
  resumenDeAplicacion,
  veredictoDeCobertura,
} from './web-companion-panel.component';
import {
  normalizeApply,
  normalizeInventory,
  normalizeProbe,
  normalizeQueue,
  normalizeStatus,
  WebCompanionService,
} from '../../../core/services/web-companion.service';

/**
 * El panel mide y lo cuenta. Lo que se prueba aquí es que no adorne el
 * resultado — sobre todo el caso de cero, que es el que hace falta saber.
 */
describe('Web Companion: cómo se cuenta lo medido', () => {
  const base = {
    waiting: 27,
    visibleStore: 0,
    withMessages: 0,
    candidates: 0,
    seedUsable: 0,
    sinSeed: 27,
    rejections: {},
    bySource: {},
    wakeableChats: 0,
    readOnly: true,
  };

  it('si Web no ve ninguna, lo dice', () => {
    expect(veredictoDeCobertura(base)).toContain('no ve ninguna de las 27');
  });

  it('distingue "no las ve" de "las ve pero están vacías"', () => {
    const texto = veredictoDeCobertura({ ...base, visibleStore: 21 });
    expect(texto).toContain('ve 21 de 27');
    expect(texto).toContain('ninguna tiene un mensaje real');
  });

  it('cuando hay referencias, da el número exacto', () => {
    expect(veredictoDeCobertura({ ...base, visibleStore: 21, seedUsable: 14 })).toContain(
      '14 de 27',
    );
  });

  it('una sola referencia se escribe en singular', () => {
    expect(veredictoDeCobertura({ ...base, seedUsable: 1 })).toContain('1 de 27 tiene una');
  });

  it('sin conversaciones esperando no se inventa un problema', () => {
    expect(veredictoDeCobertura({ ...base, waiting: 0, sinSeed: 0 })).toContain(
      'No hay conversaciones esperando',
    );
  });
});

describe('Web Companion: lectura de la respuesta del backend', () => {
  it('un estado desconocido NO se muestra como bueno', () => {
    expect(normalizeStatus({ state: 'algo_nuevo' }).state).toBe('error');
  });

  it('el QR sólo se considera disponible si el backend lo dice', () => {
    expect(normalizeStatus({ state: 'qr_required' }).qrAvailable).toBe(false);
    expect(normalizeStatus({ state: 'qr_required', qr_available: true }).qrAvailable).toBe(true);
  });

  it('siempre se marca como experimental salvo que el backend lo niegue', () => {
    expect(normalizeStatus({ state: 'ready' }).experimental).toBe(true);
  });

  it('sólo lectura NO se asume: lo tiene que declarar el backend', () => {
    expect(normalizeProbe({}).readOnly).toBe(false);
    expect(normalizeProbe({ read_only: true }).readOnly).toBe(true);
  });

  it('el inventario se lee de metrics', () => {
    const inv = normalizeInventory({
      metrics: { python_chats: 40, union_chats: 46, extra_vs_python: 6, missing_vs_python: 0 },
    });
    expect(inv.pythonChats).toBe(40);
    expect(inv.unionChats).toBe(46);
    expect(inv.extraVsPython).toBe(6);
  });

  it('una respuesta vacía da ceros, no errores', () => {
    expect(normalizeInventory({}).unionChats).toBe(0);
    expect(normalizeProbe({}).waiting).toBe(0);
  });

  it('se distingue lo que propuso Node de lo que validó Python', () => {
    const p = normalizeProbe({ candidates: 9, seed_usable: 4 });
    expect(p.candidates).toBe(9);
    expect(p.seedUsable).toBe(4);
  });
});

/**
 * El QR del Web Companion.
 *
 * El bug: el panel imprimia la cadena cruda en un <pre>. Un QR es una imagen;
 * una cadena de 200 caracteres no la escanea nadie.
 */
describe('Web Companion: el QR', () => {
  it('el payload NO llega al frontend', () => {
    // Se pinta en el backend, como el del emparejamiento principal.
    const s = normalizeStatus({ state: 'qr_required', qr_available: true, qr_generation: 1 });
    expect((s as unknown as Record<string, unknown>)['qr']).toBeUndefined();
    expect(s.qrAvailable).toBe(true);
  });

  it('la generacion viaja para poder repintar', () => {
    expect(normalizeStatus({ state: 'qr_required', qr_generation: 7 }).qrGeneration).toBe(7);
  });

  it('sin generacion se asume cero, no undefined', () => {
    expect(normalizeStatus({ state: 'qr_required' }).qrGeneration).toBe(0);
  });

  it('la URL de la imagen cambia con cada QR nuevo', () => {
    // Sin esto el navegador reutiliza la anterior y el usuario escanea un
    // codigo muerto una y otra vez.
    const a = urlDeQr(3);
    const b = urlDeQr(4);
    expect(a).not.toBe(b);
    expect(a).toContain('/web-companion/qr/image');
    expect(a).toContain('generation=3');
  });

  it('conectado ya no hay QR que ensenar', () => {
    expect(normalizeStatus({ state: 'ready', qr_available: false }).qrAvailable).toBe(false);
  });
});

describe('Web Companion: render visual del QR', () => {
  const mockApi = {
    status: () => of(normalizeStatus({ state: 'stopped' })),
    qrImageUrl: (generation: number) => `/qr.png?generation=${generation}`,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WebCompanionPanelComponent],
      providers: [{ provide: WebCompanionService, useValue: mockApi }],
    });
  });

  it('normaliza estados separados sin inferir ready', () => {
    const status = normalizeStatus({
      running: true,
      process_running: true,
      authenticated: true,
      web_client_ready: false,
      store_ready: false,
      probe_running: false,
    });
    expect(status.processRunning).toBe(true);
    expect(status.authenticated).toBe(true);
    expect(status.webClientReady).toBe(false);
    expect(status.storeReady).toBe(false);
  });

  it('qr_required pinta una imagen y nunca la cadena cruda', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(
      normalizeStatus({ state: 'qr_required', qr_available: true, qr_generation: 3 }),
    );
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('.qr img') as HTMLImageElement;
    expect(image).toBeTruthy();
    expect(image.src).toContain('generation=3');
    expect(fixture.nativeElement.textContent).not.toContain('2@PAYLOAD_SECRETO');
  });

  it('un QR renovado reemplaza la URL anterior', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(
      normalizeStatus({ state: 'qr_required', qr_available: true, qr_generation: 3 }),
    );
    fixture.detectChanges();
    const anterior = (fixture.nativeElement.querySelector('.qr img') as HTMLImageElement).src;

    fixture.componentInstance.status.set(
      normalizeStatus({ state: 'qr_required', qr_available: true, qr_generation: 4 }),
    );
    fixture.detectChanges();
    const nuevo = (fixture.nativeElement.querySelector('.qr img') as HTMLImageElement).src;
    expect(nuevo).not.toBe(anterior);
    expect(nuevo).toContain('generation=4');
  });

  it('ready oculta el QR y error muestra el mensaje', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(normalizeStatus({ state: 'ready', qr_available: false }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.qr img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Conectando');

    fixture.componentInstance.status.set(
      normalizeStatus({ state: 'error', error: 'Chromium no arrancó' }),
    );
    fixture.componentInstance.error.set('Chromium no arrancó');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Chromium no arrancó');
  });

  it('habilita probe con client ready aunque Store no esté listo', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(
      normalizeStatus({
        enabled: true,
        running: true,
        state: 'connected',
        web_client_ready: true,
        store_ready: false,
        probe_running: false,
      }),
    );
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (element: HTMLButtonElement) => element.textContent?.includes('Probar cobertura Web'),
    );
    expect(button?.disabled).toBe(false);
  });

  it('deshabilita probe mientras client ready sea falso', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(
      normalizeStatus({
        enabled: true,
        running: true,
        state: 'connected',
        web_client_ready: false,
      }),
    );
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (element: HTMLButtonElement) => element.textContent?.includes('Probar cobertura Web'),
    );
    expect(button?.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Conectando');
  });
});

/** Replica de `WebCompanionService.qrImageUrl`, sin arrancar Angular. */
function urlDeQr(generation: number, size = 320): string {
  return `/api/v1/web-companion/qr/image?generation=${generation}&size=${size}`;
}

/**
 * Aplicar las referencias: la única acción del panel que escribe.
 *
 * Lo que se protege aquí es la separación. "Probar cobertura Web" mide y
 * "Usar referencias Web" muta, y son dos botones porque compartir uno
 * convertiría cualquier medición en una escritura.
 */
describe('Web Companion: aplicar las referencias', () => {
  const aplicado = {
    candidates: 22,
    validated: 22,
    inserted: 22,
    already_present: 0,
    promoted_to_pending: 22,
    rejected: 0,
    still_waiting_without_seed: 3,
    on_demand_capability: 'CONFIRMED',
    enqueued: 22,
  };

  it('lee cada número por separado', () => {
    const a = normalizeApply(aplicado);
    expect(a.inserted).toBe(22);
    expect(a.promoted).toBe(22);
    expect(a.stillWaiting).toBe(3);
    expect(a.capability).toBe('CONFIRMED');
  });

  it('distingue lo insertado de lo que ya estaba', () => {
    // Aplicar dos veces no duplica: la segunda todo cae en already_present.
    const a = normalizeApply({ ...aplicado, inserted: 0, already_present: 22 });
    expect(a.inserted).toBe(0);
    expect(a.alreadyPresent).toBe(22);
  });

  it('la capacidad NO se asume si el backend no la dice', () => {
    expect(normalizeApply({}).capability).toBe('UNKNOWN');
  });

  it('dice "iniciando", no "sincronizado"', () => {
    // Un chat sólo está completo cuando el teléfono contesta que no le queda
    // nada. Antes de eso no se puede prometer.
    const texto = resumenDeAplicacion(normalizeApply(aplicado));
    expect(texto).toContain('22 referencias encontradas');
    expect(texto).toContain('Iniciando recuperación');
    expect(texto).not.toContain('sincronizad');
  });

  it('sin nada que aplicar no se inventa un éxito', () => {
    const texto = resumenDeAplicacion(
      normalizeApply({ ...aplicado, validated: 0, promoted_to_pending: 0 }),
    );
    expect(texto).toContain('No había ninguna referencia');
  });

  it('una sola referencia se escribe en singular', () => {
    const texto = resumenDeAplicacion(normalizeApply({ ...aplicado, promoted_to_pending: 1 }));
    expect(texto).toContain('1 referencia encontrada.');
  });

  it('la cola se lee tal cual la manda el backend', () => {
    const q = normalizeQueue({
      pending: 15,
      paused: true,
      pause_reason: 'telefono',
      waiting_for_phone: true,
      dug: 7,
    });
    expect(q?.pending).toBe(15);
    expect(q?.waitingForPhone).toBe(true);
    expect(q?.dug).toBe(7);
  });

  it('"esperando al teléfono" NO se deduce: lo declara el backend', () => {
    expect(normalizeQueue({ paused: true })?.waitingForPhone).toBe(false);
  });
});

describe('Web Companion: el panel al aplicar', () => {
  const probeConReferencias = normalizeProbe({
    waiting: 25,
    visible_store: 25,
    with_messages: 22,
    candidates: 22,
    seed_usable: 22,
    sin_seed: 3,
    read_only: true,
  });

  const listo = normalizeStatus({
    enabled: true,
    running: true,
    state: 'connected',
    web_client_ready: true,
  });

  let aplicaciones = 0;

  beforeEach(() => {
    aplicaciones = 0;
    TestBed.configureTestingModule({
      imports: [WebCompanionPanelComponent],
      providers: [
        {
          provide: WebCompanionService,
          useValue: {
            status: () => of(listo),
            qrImageUrl: (g: number) => `/qr.png?generation=${g}`,
            applySeeds: () => {
              aplicaciones += 1;
              return of(
                normalizeApply({
                  candidates: 22,
                  validated: 22,
                  inserted: 22,
                  already_present: 0,
                  promoted_to_pending: 22,
                  rejected: 0,
                  still_waiting_without_seed: 3,
                  on_demand_capability: 'CONFIRMED',
                  enqueued: 22,
                  queue: { pending: 22, paused: false, waiting_for_phone: false, dug: 0 },
                }),
              );
            },
            resume: () =>
              of(
                normalizeQueue({
                  pending: 15,
                  paused: false,
                  waiting_for_phone: false,
                  dug: 7,
                }),
              ),
          },
        },
      ],
    });
  });

  const botonDe = (fixture: any, texto: string) =>
    [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLButtonElement) =>
      b.textContent?.includes(texto),
    ) as HTMLButtonElement | undefined;

  it('sin haber medido no hay botón de aplicar', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(listo);
    fixture.detectChanges();
    expect(botonDe(fixture, 'Usar referencias Web')).toBeUndefined();
  });

  it('con referencias medidas aparece el botón', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(listo);
    fixture.componentInstance.probe.set(probeConReferencias);
    fixture.detectChanges();
    expect(botonDe(fixture, 'Usar referencias Web')).toBeTruthy();
  });

  it('si no hay ninguna referencia usable no se ofrece aplicar', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(listo);
    fixture.componentInstance.probe.set(normalizeProbe({ waiting: 3, seed_usable: 0 }));
    fixture.detectChanges();
    expect(botonDe(fixture, 'Usar referencias Web')).toBeUndefined();
  });

  it('se recomienda mantener el teléfono activo ANTES de empezar', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(listo);
    fixture.componentInstance.probe.set(probeConReferencias);
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('mantén tu teléfono encendido');
    // Recomendación, no regla del protocolo.
    expect(texto).toContain('Para mejorar la fiabilidad');
  });

  it('aplicar manda UNA sola petición y muestra el progreso', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(listo);
    fixture.componentInstance.probe.set(probeConReferencias);
    fixture.detectChanges();

    botonDe(fixture, 'Usar referencias Web')!.click();
    fixture.detectChanges();

    expect(aplicaciones).toBe(1);
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Iniciando recuperación');
    expect(texto).toContain('Pendientes');
  });

  it('aplicado, el botón desaparece: no se aplica dos veces por accidente', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(listo);
    fixture.componentInstance.probe.set(probeConReferencias);
    fixture.detectChanges();
    botonDe(fixture, 'Usar referencias Web')!.click();
    fixture.detectChanges();
    expect(botonDe(fixture, 'Usar referencias Web')).toBeUndefined();
  });

  it('si el teléfono duerme se explica qué hacer, sin hablar de errores', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(listo);
    fixture.componentInstance.apply.set(
      normalizeApply({
        promoted_to_pending: 22,
        inserted: 22,
        still_waiting_without_seed: 3,
        on_demand_capability: 'CONFIRMED',
        queue: {
          pending: 15,
          paused: true,
          pause_reason: 'telefono',
          waiting_for_phone: true,
          dug: 7,
        },
      }),
    );
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Abre WhatsApp');
    expect(texto).toContain('No se ha perdido nada');
    expect(botonDe(fixture, 'Reintentar')).toBeTruthy();
  });

  it('lo ya recuperado se sigue viendo mientras está pausado', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(listo);
    fixture.componentInstance.apply.set(
      normalizeApply({
        promoted_to_pending: 22,
        queue: { pending: 15, paused: true, waiting_for_phone: true, dug: 7 },
      }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('7 / 22');
  });

  it('reintentar actualiza el progreso sin perder lo aplicado', () => {
    const fixture = TestBed.createComponent(WebCompanionPanelComponent);
    fixture.componentInstance.status.set(listo);
    fixture.componentInstance.apply.set(
      normalizeApply({
        promoted_to_pending: 22,
        inserted: 22,
        queue: { pending: 15, paused: true, waiting_for_phone: true, dug: 7 },
      }),
    );
    fixture.detectChanges();

    botonDe(fixture, 'Reintentar')!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.apply()?.inserted).toBe(22);
    expect(fixture.componentInstance.apply()?.queue?.waitingForPhone).toBe(false);
  });
});
