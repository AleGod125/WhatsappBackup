import { TestBed } from '@angular/core/testing';
import { SyncPanelComponent } from './sync-panel.component';

/**
 * El bloque de sincronización de la vista principal.
 *
 * Dos acciones y una confirmación. Lo que se protege aquí es que
 * «Recuperar historial completo» no se dispare de un clic despistado y que el
 * diálogo diga, con esas palabras, que no se borra nada — porque «completo»
 * invita a pensar lo contrario.
 */
describe('Panel de sincronización', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SyncPanelComponent] });
  });

  const crear = (props: Partial<Record<string, unknown>> = {}) => {
    const fixture = TestBed.createComponent(SyncPanelComponent);
    fixture.componentRef.setInput('status', undefined);
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

  it('sin nada pendiente dice que está al día', () => {
    const fixture = crear({ pendingChats: 0 });
    expect(fixture.nativeElement.textContent).toContain('Copia al día');
  });

  it('con chats pendientes lo dice, y cuántos', () => {
    const fixture = crear({ pendingChats: 3 });
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Copia incompleta');
    expect(texto).toContain('3 chats pendientes');
  });

  it('uno solo se escribe en singular', () => {
    expect(crear({ pendingChats: 1 }).nativeElement.textContent).toContain('1 chat pendiente');
  });

  it('mientras sincroniza el botón lo dice', () => {
    const fixture = crear({ running: true });
    expect(boton(fixture, 'Sincronizando…')).toBeTruthy();
  });

  it('deshabilitado no se puede pulsar, y explica por qué', () => {
    const fixture = crear({ disabled: true, tooltip: 'WhatsApp no está conectado.' });
    const b = boton(fixture, 'Sincronizar ahora')!;
    expect(b.disabled).toBe(true);
    expect(b.title).toContain('WhatsApp no está conectado');
  });

  it('«Sincronizar ahora» emite directamente', () => {
    const fixture = crear();
    let veces = 0;
    fixture.componentInstance.sync.subscribe(() => (veces += 1));
    boton(fixture, 'Sincronizar ahora')!.click();
    expect(veces).toBe(1);
  });

  it('«Recuperar historial completo» NO se dispara de un clic', () => {
    const fixture = crear();
    let veces = 0;
    fixture.componentInstance.fullRecovery.subscribe(() => (veces += 1));
    boton(fixture, 'Recuperar historial completo')!.click();
    fixture.detectChanges();
    expect(veces).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('No se eliminará nada');
  });

  it('el diálogo promete explícitamente que no borra', () => {
    const fixture = crear();
    boton(fixture, 'Recuperar historial completo')!.click();
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('volverá a revisar tus chats');
    expect(texto).toContain('No se eliminará nada');
    // En la interfaz del usuario no se usa la palabra "reset".
    expect(texto.toLowerCase()).not.toContain('reset');
  });

  it('cancelar cierra sin hacer nada', () => {
    const fixture = crear();
    let veces = 0;
    fixture.componentInstance.fullRecovery.subscribe(() => (veces += 1));
    boton(fixture, 'Recuperar historial completo')!.click();
    fixture.detectChanges();
    boton(fixture, 'Cancelar')!.click();
    fixture.detectChanges();
    expect(veces).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain('No se eliminará nada');
  });

  it('continuar sí la lanza, una sola vez', () => {
    const fixture = crear();
    let veces = 0;
    fixture.componentInstance.fullRecovery.subscribe(() => (veces += 1));
    boton(fixture, 'Recuperar historial completo')!.click();
    fixture.detectChanges();
    boton(fixture, 'Continuar')!.click();
    fixture.detectChanges();
    expect(veces).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('No se eliminará nada');
  });

  it('si el teléfono duerme se dice qué hacer', () => {
    const fixture = crear({ waitingForPhone: true });
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Esperando al teléfono');
    expect(texto).toContain('Abre WhatsApp');
    expect(texto).toContain('No se ha perdido nada');
  });
});
