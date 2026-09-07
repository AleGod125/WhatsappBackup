import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/services/auth.service';
import { RealtimeService } from '../../core/events/realtime.service';
import { SessionExitService } from '../../core/services/session-exit.service';

/**
 * Los tres puntos de la cabecera, que hasta ahora eran un adorno.
 *
 * EL PROBLEMA
 * -----------
 * El botón existía —`<button aria-label="Más opciones">•••</button>`— y no
 * tenía ningún manejador. Un botón visible que no hace nada es peor que no
 * tenerlo: enseña a desconfiar del resto de la interfaz.
 *
 * DOS OPCIONES, LAS QUE DE VERDAD HAY
 * -----------------------------------
 * «Sincronizar ahora» y «Cerrar sesión». Nada inventado.
 *
 * CERRAR SESION NO ES DESVINCULAR
 * -------------------------------
 * Son cosas distintas y confundirlas cuesta un código QR. Cerrar sesión acaba
 * la sesión **web**: invalida la cookie, cierra el canal de tiempo real del
 * navegador y devuelve al login. No toca `device.json`, ni el Signal Store, ni
 * los chats, ni Google Drive, ni detiene la conexión con WhatsApp.
 *
 * Por eso se pregunta antes: es reversible, pero obliga a volver a entrar, y
 * un clic despistado en un menú pequeño no debería costar eso.
 */
@Component({
  selector: 'app-header-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="envoltorio">
      <button
        type="button"
        class="disparador"
        [attr.aria-expanded]="abierto()"
        aria-haspopup="menu"
        aria-label="Más opciones"
        (click)="alternar()"
      >
        •••
      </button>

      @if (abierto()) {
        <div class="menu" role="menu">
          @if (!confirmando()) {
            <button
              type="button"
              role="menuitem"
              [disabled]="sincronizando()"
              (click)="pedirSync()"
            >
              {{ sincronizando() ? 'Sincronizando…' : 'Sincronizar ahora' }}
            </button>
            <button type="button" role="menuitem" (click)="confirmando.set(true)">
              Cerrar sesión
            </button>
          } @else {
            <p class="pregunta">¿Cerrar sesión?</p>
            <p class="fino">
              Se cierra sólo la sesión de esta ventana. WhatsApp sigue vinculado.
            </p>
            <div class="acciones">
              <button type="button" class="secundario" (click)="confirmando.set(false)">
                Cancelar
              </button>
              <button type="button" class="peligro" [disabled]="saliendo()" (click)="salir()">
                Cerrar sesión
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .envoltorio {
        position: relative;
      }
      .disparador {
        background: none;
        border: 0;
        color: inherit;
        cursor: pointer;
        font: inherit;
        padding: 4px 8px;
        border-radius: 6px;
      }
      .disparador:hover {
        background: var(--surface-hover, rgba(127, 127, 127, 0.12));
      }
      .menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 30;
        min-width: 220px;
        display: grid;
        gap: 2px;
        padding: 6px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--surface, #1f2c33);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      }
      .menu > button[role='menuitem'] {
        text-align: left;
        background: none;
        border: 0;
        color: inherit;
        font: inherit;
        padding: 9px 10px;
        border-radius: 6px;
        cursor: pointer;
      }
      .menu > button[role='menuitem']:hover:not(:disabled) {
        background: var(--surface-hover, rgba(127, 127, 127, 0.12));
      }
      .menu > button[role='menuitem']:disabled {
        opacity: 0.55;
        cursor: default;
      }
      .pregunta {
        margin: 6px 10px 2px;
        font-size: var(--font-size-sm);
        font-weight: 600;
      }
      .fino {
        margin: 0 10px 8px;
        font-size: var(--font-size-xs);
        color: var(--text-muted);
        max-width: 30ch;
      }
      .acciones {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
        padding: 0 6px 4px;
      }
      .acciones button {
        font: inherit;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        border: 1px solid var(--border);
        background: transparent;
        color: inherit;
      }
      .acciones .peligro {
        border-color: var(--danger, #d9534f);
        color: var(--danger, #d9534f);
      }
    `,
  ],
})
export class HeaderMenuComponent {
  private readonly salida = inject(SessionExitService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Para no ofrecer «Sincronizar» mientras ya se está sincronizando. */
  readonly sincronizando = input<boolean>(false);

  /** El padre es quien sabe cómo lanzar la sincronización. */
  readonly sincronizar = output<void>();

  readonly abierto = signal(false);
  readonly confirmando = signal(false);
  readonly saliendo = signal(false);

  alternar(): void {
    const siguiente = !this.abierto();
    this.abierto.set(siguiente);
    if (!siguiente) this.confirmando.set(false);
  }

  cerrar(): void {
    this.abierto.set(false);
    this.confirmando.set(false);
  }

  /** Un clic fuera cierra el menú, como cualquier menú. */
  @HostListener('document:click', ['$event'])
  alClicarFuera(evento: MouseEvent): void {
    if (!this.abierto()) return;
    if (!this.host.nativeElement.contains(evento.target as Node)) this.cerrar();
  }

  @HostListener('document:keydown.escape')
  alEscape(): void {
    this.cerrar();
  }

  pedirSync(): void {
    this.sincronizar.emit();
    this.cerrar();
  }

  /**
   * Cierra la sesión web. Nada más.
   *
   * El orden importa: primero se corta el canal de tiempo real del navegador
   * y luego se navega. Al revés, el `EventSource` puede seguir reconectando
   * contra una sesión que ya no existe y llenar la consola de 401.
   */
  salir(): void {
    if (this.saliendo()) return;
    this.saliendo.set(true);
    // El camino de salida es UNO, compartido con el botón de opciones: corta
    // el canal en vivo, vacía lo que sobrevive a la navegación y lleva al
    // login. Repetir aquí esos pasos es cómo se acaba con dos versiones y una
    // de ellas filtrando datos.
    this.salida
      .salir()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.terminado(),
        error: () => this.terminado(),
        complete: () => this.terminado(),
      });
  }

  private terminado(): void {
    this.saliendo.set(false);
    this.cerrar();
  }
}
