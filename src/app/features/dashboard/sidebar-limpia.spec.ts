import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ProgressToolbarComponent } from './progress-toolbar.component';
import { RECUENTO_VACIO, Recuento } from './recuento';
import { RecoverySectionComponent } from '../settings/recovery-section.component';
import { WebCompanionService } from '../../core/services/web-companion.service';

/**
 * La barra lateral prioriza las conversaciones. Todo lo demás está a un clic.
 *
 * QUE SE PROTEGE
 * --------------
 * Debajo de la lista había tres componentes apilados: la tarjeta de
 * recuperación, el panel de puesta en marcha —con un **código QR grande
 * dentro**— y el panel de sincronización con sus dos botones. Entre los tres
 * se comían media barra lateral.
 *
 * Y el código aparecía sin que nadie lo hubiera pedido, lo que le daba aspecto
 * de paso obligatorio. No lo es: la aplicación funciona entera sin el segundo
 * dispositivo. Lo que aporta son referencias para conversaciones cuyo
 * historial todavía no se puede pedir desde la vinculación principal.
 *
 * Estas pruebas fijan las dos reglas que lo mantienen así:
 *
 * 1. en la barra lateral cabe **una** representación del estado, de una línea;
 * 2. el segundo código **no se enseña** hasta que el usuario lo pide.
 *
 * EL IDIOMA DE LAS PRUEBAS
 * ------------------------
 * El entorno resuelve el catálogo en inglés, así que los textos se comprueban
 * en inglés. Donde se puede se comprueba la ESTRUCTURA —que haya una sola
 * barra, que no haya ninguna imagen— porque eso no depende del idioma y
 * sobrevive a cualquier retoque de redacción.
 */

function recuento(parcial: Partial<Recuento>): Recuento {
  const base = { ...RECUENTO_VACIO, ...parcial };
  return {
    ...base,
    total:
      parcial.total ??
      base.recuperados +
        base.recuperandose +
        base.reintentando +
        base.esperandoReferencia +
        base.sinMensajes +
        base.error,
  };
}

// ---------------------------------------------------------------------------
// La barra compacta
// ---------------------------------------------------------------------------

describe('Barra compacta de progreso', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ProgressToolbarComponent] });
  });

  const crear = (props: Record<string, unknown>) => {
    const fixture = TestBed.createComponent(ProgressToolbarComponent);
    for (const [clave, valor] of Object.entries(props)) {
      fixture.componentRef.setInput(clave, valor);
    }
    fixture.detectChanges();
    return fixture;
  };

  it('sin conversaciones no ocupa nada', () => {
    const fixture = crear({ recuento: recuento({}) });
    expect(fixture.nativeElement.querySelector('.barra-estado')).toBeNull();
  });

  it('cabe en una sola fila: barra, estado y cifra', () => {
    const fixture = crear({ recuento: recuento({ recuperados: 7, recuperandose: 34 }) });
    // Una barra de progreso, ni una más: si aparecieran dos, habría vuelto a
    // haber dos bloques contando lo mismo.
    expect(fixture.nativeElement.querySelectorAll('[role="progressbar"]').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('7/41');
  });

  it('la barra avanza con conversaciones resueltas, no con mensajes', () => {
    // 7 de 41 es una fracción con denominador conocido. «Mensajes traídos
    // sobre mensajes totales» no lo es: el total no se sabe hasta traerlos.
    const fixture = crear({ recuento: recuento({ recuperados: 7, recuperandose: 34 }) });
    const barra = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(barra.getAttribute('aria-valuenow')).toBe('17');
  });

  it('«sin mensajes disponibles» cuenta como resuelta', () => {
    // El servidor contestó y no había nada que traer: está tan terminada como
    // una sincronizada. Contarla como pendiente dejaría la copia marcada como
    // incompleta para siempre.
    const fixture = crear({ recuento: recuento({ recuperados: 5, sinMensajes: 5 }) });
    const barra = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(barra.getAttribute('aria-valuenow')).toBe('100');
  });

  it('los mensajes guardados salen como cifra, nunca como porcentaje', () => {
    const fixture = crear({
      recuento: recuento({ recuperados: 7, recuperandose: 34 }),
      mensajes: 4035,
    });
    expect(fixture.nativeElement.textContent).toContain('4035');
  });

  it('cuando ya no queda trabajo lo dice y el punto se para', () => {
    const fixture = crear({ recuento: recuento({ recuperados: 41 }) });
    expect(fixture.nativeElement.textContent).toContain('All up to date');
    expect(fixture.nativeElement.querySelector('.punto.quieto')).not.toBeNull();
  });

  it('mientras trabaja lo dice en las palabras del usuario', () => {
    const texto = crear({ recuento: recuento({ recuperandose: 4 }) }).nativeElement.textContent;
    expect(texto).toContain('Recovering history');
    // Nada de vocabulario del protocolo en la barra lateral.
    expect(texto).not.toMatch(/seed|WAMID|ON_DEMAND/i);
  });

  it('esperando referencia dice que está preparando, sin tecnicismos', () => {
    const texto = crear({
      recuento: recuento({ esperandoReferencia: 9 }),
    }).nativeElement.textContent;
    expect(texto).toContain('Preparing conversations');
    expect(texto).not.toMatch(/seed|WAMID|ON_DEMAND/i);
  });

  it('el detalle NO se despliega aquí: se pide y se abre en los ajustes', () => {
    const fixture = crear({ recuento: recuento({ recuperandose: 3 }) });
    let pedido = 0;
    fixture.componentInstance.abrirDetalle.subscribe(() => (pedido += 1));
    fixture.nativeElement.querySelector('.barra-estado').click();
    expect(pedido).toBe(1);
    // Y no ha crecido nada dentro de la barra lateral.
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(1);
  });

  it('se repinta sola cuando cambian las cifras, sin recargar', () => {
    const fixture = crear({ recuento: recuento({ recuperados: 1, recuperandose: 9 }) });
    expect(fixture.nativeElement.textContent).toContain('1/10');
    fixture.componentRef.setInput('recuento', recuento({ recuperados: 6, recuperandose: 4 }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('6/10');
  });

  it('no enseña ningún código QR', () => {
    const fixture = crear({ recuento: recuento({ esperandoReferencia: 34 }) });
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// La recuperación avanzada, en los ajustes y sólo si se pide
// ---------------------------------------------------------------------------

const ESTADO_BASE = {
  enabled: true,
  running: false,
  processRunning: false,
  authenticated: false,
  webClientReady: false,
  storeReady: false,
  probeRunning: false,
  startupTimeout: false,
  state: 'qr_required' as const,
  qrAvailable: true,
  qrGeneration: 3,
  canStart: true,
  experimental: true,
};

describe('Recuperación avanzada (ajustes)', () => {
  let start: ReturnType<typeof vi.fn>;
  let stop: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    start = vi.fn(() => of(ESTADO_BASE));
    stop = vi.fn(() => of({ ...ESTADO_BASE, running: false, state: 'stopped' as const }));
    TestBed.configureTestingModule({
      imports: [RecoverySectionComponent],
      providers: [
        {
          provide: WebCompanionService,
          useValue: { start, stop, qrImageUrl: (g: number) => `/qr/${g}` },
        },
      ],
    });
  });

  const crear = (props: Record<string, unknown>) => {
    const fixture = TestBed.createComponent(RecoverySectionComponent);
    fixture.componentRef.setInput('avanzadaDisponible', true);
    for (const [clave, valor] of Object.entries(props)) {
      fixture.componentRef.setInput(clave, valor);
    }
    fixture.detectChanges();
    return fixture;
  };

  const boton = (fixture: any, texto: string) =>
    [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLButtonElement) =>
      b.textContent?.includes(texto),
    ) as HTMLButtonElement | undefined;

  it('el detalle por categorías vive aquí', () => {
    const fixture = crear({
      recuento: recuento({ recuperados: 7, esperandoReferencia: 34 }),
      mensajes: 4035,
    });
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Sync and recovery');
    expect(texto).toContain('4035');
    expect(boton(fixture, 'Sync now')).toBeDefined();
    expect(boton(fixture, 'Recover full history')).toBeDefined();
  });

  it('se ofrece como OPCIONAL, nunca como necesaria', () => {
    const texto = crear({
      recuento: recuento({ esperandoReferencia: 34 }),
    }).nativeElement.textContent;
    expect(texto).toContain('Advanced recovery');
    expect(texto).toContain('Optional');
    expect(texto).not.toMatch(/required|mandatory|you must/i);
  });

  it('dice cuántas conversaciones lo necesitarían', () => {
    const texto = crear({
      recuento: recuento({ esperandoReferencia: 34 }),
    }).nativeElement.textContent;
    expect(texto).toContain('34 conversations');
  });

  it('NO enseña el código hasta que se pulsa vincular', () => {
    // LA REGLA. Verlo sin pedirlo es lo que le daba aspecto de paso obligado.
    const fixture = crear({ recuento: recuento({ esperandoReferencia: 34 }) });
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(start).not.toHaveBeenCalled();

    boton(fixture, 'Link a second device')!.click();
    fixture.detectChanges();

    expect(start).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  });

  it('sin conversaciones esperando referencia, ni se ofrece', () => {
    // No habría nada que arreglar: pedir un segundo código sería molestar por
    // costumbre.
    const fixture = crear({ recuento: recuento({ recuperados: 41 }) });
    expect(boton(fixture, 'Link a second device')).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('Not needed');
  });

  it('si el segundo dispositivo no está disponible, no se menciona', () => {
    const fixture = TestBed.createComponent(RecoverySectionComponent);
    fixture.componentRef.setInput('recuento', recuento({ esperandoReferencia: 34 }));
    fixture.componentRef.setInput('avanzadaDisponible', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Advanced recovery');
  });

  it('cerrar el panel deja de enseñar el código y NO desvincula', () => {
    const fixture = crear({ recuento: recuento({ esperandoReferencia: 34 }) });
    boton(fixture, 'Link a second device')!.click();
    fixture.detectChanges();

    boton(fixture, 'Cancel')!.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    // Cancelar es dejar de MIRAR. Apagar el worker es otra cosa, y desvincular
    // el teléfono es una tercera.
    expect(stop).not.toHaveBeenCalled();
  });

  it('desactivarla para el proceso y avisa de que sigue vinculado', () => {
    start = vi.fn(() => of({ ...ESTADO_BASE, running: true, state: 'ready' as const }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RecoverySectionComponent],
      providers: [
        {
          provide: WebCompanionService,
          useValue: { start, stop, qrImageUrl: (g: number) => `/qr/${g}` },
        },
      ],
    });
    const fixture = crear({ recuento: recuento({ esperandoReferencia: 34 }) });

    boton(fixture, 'Link a second device')!.click();
    fixture.detectChanges();
    // Mientras está activa se dice que lo está, y se avisa de que apagarla NO
    // desvincula: es la confusión que costaría un código QR de más.
    expect(fixture.nativeElement.textContent).toContain('Advanced recovery is active');
    expect(fixture.nativeElement.textContent).toContain('stays linked');

    boton(fixture, 'Turn off advanced recovery')!.click();
    fixture.detectChanges();

    // Se para el proceso y se vuelve a ofrecer, sin haber borrado nada.
    expect(stop).toHaveBeenCalledTimes(1);
    expect(boton(fixture, 'Link a second device')).toBeDefined();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
});
