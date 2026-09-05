import { TestBed } from '@angular/core/testing';
import { ChatSidebarComponent } from './chat-sidebar.component';

/**
 * Cargando, error y vacío son TRES cosas distintas.
 *
 * Mostrar "No se encontraron conversaciones" cuando la petición falló hace
 * creer al usuario que su copia se ha perdido. Y mostrarlo mientras carga
 * hace parpadear ese mismo susto en cada entrada al panel.
 */
describe('estados del sidebar', () => {
  function montar(props: Record<string, unknown>) {
    TestBed.configureTestingModule({ imports: [ChatSidebarComponent] });
    const fixture = TestBed.createComponent(ChatSidebarComponent);
    for (const [clave, valor] of Object.entries(props)) {
      fixture.componentRef.setInput(clave, valor);
    }
    fixture.detectChanges();
    return fixture;
  }

  it('mientras carga no dice que no hay conversaciones', () => {
    const fixture = montar({ chats: [], loading: true });
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).not.toContain('No se encontraron conversaciones');
    fixture.destroy();
  });

  it('si la carga falló lo dice, y no "no hay conversaciones"', () => {
    const fixture = montar({
      chats: [],
      loading: false,
      error: 'No fue posible cargar las conversaciones.',
    });
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('No fue posible cargar');
    expect(texto).not.toContain('No se encontraron conversaciones');
    fixture.destroy();
  });

  it('un fallo ofrece reintentar', () => {
    const fixture = montar({ chats: [], loading: false, error: 'falló' });
    let reintentos = 0;
    fixture.componentInstance.retry.subscribe(() => (reintentos += 1));

    fixture.nativeElement.querySelector('.load-error button').click();
    expect(reintentos).toBe(1);
    fixture.destroy();
  });

  it('vacío de verdad sí dice que no hay conversaciones', () => {
    const fixture = montar({ chats: [], loading: false });
    expect(fixture.nativeElement.textContent).toContain('No se encontraron conversaciones');
    fixture.destroy();
  });

  it('un chat sin historial (waiting_seed) NO se filtra', () => {
    // `waiting_seed` afecta a cuánto historial hay, NO a si la conversación
    // existe. Filtrarla haría desaparecer un chat real.
    //
    // Se comprueba `filtered()` y no el DOM: la lista usa scroll virtual, que
    // sin altura real no pinta nada en un test. Lo que importa es que el chat
    // no quede excluido.
    const fixture = montar({
      chats: [
        { id: '1', displayName: 'Sin historial', historyStatus: 'waiting_seed' },
        { id: '2', displayName: 'Con historial', historyStatus: 'exhausted' },
      ],
      loading: false,
    });

    const visibles = fixture.componentInstance.filtered().map((c) => c.displayName);
    expect(visibles).toContain('Sin historial');
    expect(visibles).toContain('Con historial');
    fixture.destroy();
  });

  it('ningún estado de historial excluye un chat', () => {
    const estados = ['waiting_seed', 'pending', 'exhausted', 'timeout', 'error'];
    const fixture = montar({
      chats: estados.map((estado, i) => ({
        id: String(i),
        displayName: estado,
        historyStatus: estado,
      })),
      loading: false,
    });

    expect(fixture.componentInstance.filtered()).toHaveLength(estados.length);
    fixture.destroy();
  });
});
