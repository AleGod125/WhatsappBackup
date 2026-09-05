import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { SyncStatus } from '../../../core/models/api.models';

/**
 * El bloque de sincronización de la vista principal.
 *
 * Compacto a propósito. Antes esta columna acumulaba el indicador de sync, el
 * panel de almacenamiento y el del Web Companion uno debajo de otro; en un
 * móvil eso empujaba la lista de chats hasta dejarla en media pantalla.
 *
 * Aquí sólo va lo que el usuario necesita a diario: si está al día y un botón
 * para ponerse al día. Lo demás vive en «Avanzado».
 *
 * DOS ACCIONES, NO UNA
 * --------------------
 * «Sincronizar ahora» es lo normal: busca novedades y completa lo que se
 * pueda. «Recuperar historial completo» vuelve a revisar todo y adelanta los
 * reintentos que estaban esperando turno — es más lenta, así que se pide
 * aparte y se confirma. Ninguna de las dos borra nada, y el diálogo lo dice
 * con esas palabras porque «completo» invita a pensar lo contrario.
 */
@Component({
  selector: 'app-sync-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div class="linea">
        <span class="punto" [class]="tono()"></span>
        <div class="texto">
          <strong>{{ titulo() }}</strong>
          @if (subtitulo(); as sub) {
            <small>{{ sub }}</small>
          }
        </div>
      </div>

      @if (waitingForPhone()) {
        <p class="aviso">
          Abre WhatsApp en tu teléfono para continuar. No se ha perdido nada de lo ya recuperado.
        </p>
      }

      <div class="acciones">
        <button
          type="button"
          class="primario"
          [disabled]="disabled()"
          [attr.aria-label]="tooltip()"
          [title]="tooltip()"
          (click)="sync.emit()"
        >
          @if (running()) {
            Sincronizando…
          } @else {
            Sincronizar ahora
          }
        </button>
        <button
          type="button"
          class="secundario"
          [disabled]="disabled()"
          title="Vuelve a revisar todos los chats recuperables"
          (click)="confirmar.set(true)"
        >
          Recuperar historial completo
        </button>
      </div>
    </section>

    @if (confirmar()) {
      <div class="velo" (click)="confirmar.set(false)">
        <div class="dialogo" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <h3>Recuperar historial completo</h3>
          <p>
            Esto volverá a revisar tus chats y reintentará recuperar el historial disponible.
            <strong>No se eliminará nada.</strong>
          </p>
          <p class="fino">
            Puede tardar. Mantén el teléfono encendido y WhatsApp activo mientras dura.
          </p>
          <div class="acciones">
            <button type="button" class="secundario" (click)="confirmar.set(false)">
              Cancelar
            </button>
            <button type="button" class="primario" (click)="continuar()">Continuar</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .panel {
        display: grid;
        gap: 10px;
        padding: 12px 14px;
        border-top: 1px solid var(--border);
      }
      .linea {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .punto {
        flex: none;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--text-muted);
      }
      .punto.ok {
        background: var(--accent);
      }
      .punto.activo {
        background: #d9a441;
        animation: latido 1.4s ease-in-out infinite;
      }
      .punto.aviso {
        background: #d98441;
      }
      @keyframes latido {
        50% {
          opacity: 0.35;
        }
      }
      .texto {
        display: grid;
        min-width: 0;
      }
      .texto strong {
        font-size: var(--font-size-sm);
        font-weight: 550;
      }
      .texto small {
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
      }
      .aviso {
        margin: 0;
        font-size: var(--font-size-sm);
        color: #e8c07d;
      }
      .acciones {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      button {
        flex: 1 1 auto;
        /* 44px: un objetivo táctil que se puede pulsar sin apuntar. */
        min-height: 40px;
        padding: 0 14px;
        border-radius: 9px;
        border: 1px solid var(--border);
        font-size: var(--font-size-sm);
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
      button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .primario {
        background: var(--accent);
        border-color: transparent;
        color: #06251d;
        font-weight: 600;
      }
      .secundario {
        background: transparent;
        color: var(--text-secondary);
      }
      .velo {
        position: fixed;
        inset: 0;
        z-index: 80;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(0, 0, 0, 0.55);
      }
      .dialogo {
        width: min(420px, 100%);
        display: grid;
        gap: 10px;
        padding: 20px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--bg-sidebar);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
      }
      .dialogo h3 {
        margin: 0;
        font-size: var(--font-size-lg);
      }
      .dialogo p {
        margin: 0;
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
        line-height: 1.5;
      }
      .dialogo .fino {
        font-size: var(--font-size-sm);
        color: var(--text-muted);
      }
      @media (min-width: 768px) {
        button {
          min-height: 34px;
        }
      }
    `,
  ],
})
export class SyncPanelComponent {
  status = input<SyncStatus | undefined>(undefined);
  running = input(false);
  disabled = input(false);
  tooltip = input('Sincronizar ahora');
  waitingForPhone = input(false);
  pendingChats = input(0);

  sync = output<void>();
  fullRecovery = output<void>();

  readonly confirmar = signal(false);

  readonly tono = computed(() => {
    if (this.waitingForPhone()) return 'aviso';
    if (this.running()) return 'activo';
    return this.pendingChats() > 0 ? '' : 'ok';
  });

  readonly titulo = computed(() => {
    if (this.waitingForPhone()) return 'Esperando al teléfono';
    if (this.running()) return 'Sincronizando…';
    return this.pendingChats() > 0 ? 'Copia incompleta' : 'Copia al día';
  });

  readonly subtitulo = computed(() => {
    const pendientes = this.pendingChats();
    if (this.running()) {
      const fase = this.status()?.phase;
      return fase ? `Fase: ${fase}` : 'Buscando novedades…';
    }
    if (pendientes === 0) return '';
    return pendientes === 1 ? '1 chat pendiente' : `${pendientes} chats pendientes`;
  });

  continuar() {
    this.confirmar.set(false);
    this.fullRecovery.emit();
  }
}
