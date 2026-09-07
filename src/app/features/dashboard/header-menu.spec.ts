import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HeaderMenuComponent } from './header-menu.component';
import { AuthService } from '../../core/services/auth.service';
import { RealtimeService } from '../../core/events/realtime.service';

/**
 * Los tres puntos de la cabecera.
 *
 * QUE SE PROTEGE
 * --------------
 * Antes eran un adorno: `<button aria-label="Más opciones">•••</button>` sin
 * manejador. Un botón visible que no hace nada enseña a desconfiar del resto
 * de la interfaz, así que aquí se fija que las dos opciones existen y hacen
 * exactamente lo que dicen.
 *
 * Y sobre todo se fija la distinción que más caro cuesta confundir: **cerrar
 * sesión no es desvincular WhatsApp**. Cierra la sesión web y nada más.
 */
describe('Menú de la cabecera', () => {
  let logout: ReturnType<typeof vi.fn>;
  let disconnect: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logout = vi.fn(() => of({ ok: true }));
    disconnect = vi.fn();
    navigateByUrl = vi.fn(() => Promise.resolve(true));

    TestBed.configureTestingModule({
      imports: [HeaderMenuComponent],
      providers: [
        { provide: AuthService, useValue: { logout } },
        { provide: RealtimeService, useValue: { disconnect } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
  });

  const crear = (props: Record<string, unknown> = {}) => {
    const fixture = TestBed.createComponent(HeaderMenuComponent);
    for (const [clave, valor] of Object.entries(props)) {
      fixture.componentRef.setInput(clave, valor);
    }
    fixture.detectChanges();
    return fixture;
  };

  const boton = (fixture: any, texto: string) =>
    [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLButtonElement) =>
      b.textContent?.trim().includes(texto),
    ) as HTMLButtonElement | undefined;

  const abrir = (fixture: any) => {
    fixture.nativeElement.querySelector('.disparador').click();
    fixture.detectChanges();
  };

  it('cerrado no enseña ninguna opción', () => {
    const fixture = crear();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('el botón abre el menú: ya no es un adorno', () => {
    const fixture = crear();
    abrir(fixture);
    expect(fixture.nativeElement.querySelector('[role="menu"]')).not.toBeNull();
    expect(boton(fixture, 'Sincronizar ahora')).toBeDefined();
    expect(boton(fixture, 'Cerrar sesión')).toBeDefined();
  });

  it('no ofrece opciones inventadas', () => {
    const fixture = crear();
    abrir(fixture);
    const opciones = [
      ...fixture.nativeElement.querySelectorAll('[role="menuitem"]'),
    ] as HTMLElement[];
    expect(opciones).toHaveLength(2);
  });

  it('sincronizar avisa al padre y cierra el menú', () => {
    const fixture = crear();
    let pedido = 0;
    fixture.componentInstance.sincronizar.subscribe(() => (pedido += 1));
    abrir(fixture);
    boton(fixture, 'Sincronizar ahora')!.click();
    fixture.detectChanges();
    expect(pedido).toBe(1);
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('mientras sincroniza no se puede volver a pedir', () => {
    const fixture = crear({ sincronizando: true });
    abrir(fixture);
    expect(boton(fixture, 'Sincronizando')!.disabled).toBe(true);
  });

  it('cerrar sesión PREGUNTA antes, y dice que WhatsApp sigue vinculado', () => {
    const fixture = crear();
    abrir(fixture);
    boton(fixture, 'Cerrar sesión')!.click();
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('¿Cerrar sesión?');
    expect(texto).toContain('WhatsApp sigue vinculado');
    // Todavía no ha pasado nada.
    expect(logout).not.toHaveBeenCalled();
  });

  it('cancelar no cierra ninguna sesión', () => {
    const fixture = crear();
    abrir(fixture);
    boton(fixture, 'Cerrar sesión')!.click();
    fixture.detectChanges();
    boton(fixture, 'Cancelar')!.click();
    fixture.detectChanges();

    expect(logout).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
    expect(boton(fixture, 'Sincronizar ahora')).toBeDefined();
  });

  it('confirmar cierra la sesión web, corta el tiempo real y va al login', () => {
    const fixture = crear();
    abrir(fixture);
    boton(fixture, 'Cerrar sesión')!.click();
    fixture.detectChanges();
    // El de la confirmación, que es el segundo con ese texto.
    const confirmar = [
      ...fixture.nativeElement.querySelectorAll('.acciones button'),
    ].find((b: HTMLButtonElement) =>
      b.textContent?.includes('Cerrar sesión'),
    ) as HTMLButtonElement;
    confirmar.click();
    fixture.detectChanges();

    expect(logout).toHaveBeenCalledTimes(1);
    // El orden importa: primero se corta el canal, luego se navega. Al revés,
    // el EventSource sigue reconectando contra una sesión que ya no existe.
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('si el backend falla, la sesión local se cierra igual', () => {
    logout.mockReturnValue(throwError(() => new Error('sin red')));
    const fixture = crear();
    abrir(fixture);
    boton(fixture, 'Cerrar sesión')!.click();
    fixture.detectChanges();
    const confirmar = [
      ...fixture.nativeElement.querySelectorAll('.acciones button'),
    ].find((b: HTMLButtonElement) =>
      b.textContent?.includes('Cerrar sesión'),
    ) as HTMLButtonElement;
    confirmar.click();
    fixture.detectChanges();

    // Dejar al usuario dentro de un panel que ya no puede usar es peor.
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('un clic fuera cierra el menú', () => {
    const fixture = crear();
    abrir(fixture);
    document.body.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });
});
