import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { StorageStatus } from '../../../core/models/api.models';
import { StorageService } from '../../../core/services/storage.service';

/**
 * Estado de la copia en el almacenamiento.
 *
 * Deliberadamente discreto: en marcha normal es una línea. Solo crece cuando
 * hay algo que el usuario tenga que hacer. Poner un indicador de "subiendo" en
 * cada burbuja convertiría una copia de seguridad en una fuente de ansiedad.
 */
@Component({
  selector: 'app-storage-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (estado(); as s) {
      @if (s.enabled) {
        <section class="storage" [class.alerta]="necesitaAtencion()">
          <div class="fila">
            <span class="punto" [class]="s.state"></span>
            <span class="texto">{{ titulo() }}</span>
          </div>
          @if (detalle()) {
            <p class="detalle">{{ detalle() }}</p>
          }
          @if (s.state === 'reauthorization_required') {
            <button type="button" (click)="reconectar()">Reconectar Google Drive</button>
          } @else if (s.state === 'paused') {
            <button type="button" (click)="reanudar()">Reanudar</button>
          }
        </section>
      }
    }
  `,
  styles: [
    `
      .storage {
        padding: 10px 12px;
        border-top: 1px solid var(--border);
        font-size: var(--font-size-sm);
      }
      .storage.alerta {
        background: rgba(170, 120, 40, 0.12);
      }
      .fila {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .punto {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--text-secondary);
        flex: none;
      }
      .punto.up_to_date {
        background: var(--accent);
      }
      .punto.syncing {
        background: #d9ae70;
      }
      .punto.error,
      .punto.blocked,
      .punto.reauthorization_required {
        background: #d97070;
      }
      .texto {
        color: var(--text-primary);
      }
      .detalle {
        margin: 6px 0 0 16px;
        color: var(--text-secondary);
        line-height: 1.5;
      }
      button {
        margin-top: 8px;
        padding: 7px 11px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: transparent;
        color: var(--text-primary);
        font-size: var(--font-size-sm);
        cursor: pointer;
      }
    `,
  ],
})
export class StoragePanelComponent implements OnInit {
  private readonly api = inject(StorageService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly estado = signal<StorageStatus | undefined>(undefined);

  readonly necesitaAtencion = computed(() => {
    const s = this.estado();
    return !!s && ['error', 'blocked', 'reauthorization_required', 'paused'].includes(s.state);
  });

  readonly titulo = computed(() => {
    const s = this.estado();
    if (!s) return '';
    switch (s.state) {
      case 'up_to_date':
        return 'Copia al día en Google Drive';
      case 'syncing':
        return `Guardando en Google Drive (${s.pendingJobs})`;
      case 'paused':
        return 'Copia en pausa';
      case 'reauthorization_required':
        return 'Google Drive necesita reconectarse';
      case 'blocked':
        return 'Hay demasiado esperando a subirse';
      case 'error':
        return 'Algunas subidas no se completaron';
      default:
        return 'Copia local';
    }
  });

  readonly detalle = computed(() => {
    const s = this.estado();
    if (!s) return '';
    switch (s.state) {
      case 'reauthorization_required':
      case 'paused':
        // Lo importante: nada se ha perdido. Sin decirlo, un aviso rojo se
        // lee como "se están perdiendo mensajes".
        return 'No se ha perdido ningún mensaje: siguen guardados aquí y se subirán al reconectar.';
      case 'blocked':
        return 'Revisa la conexión con Google Drive. No se ha borrado nada.';
      case 'error':
        return `${s.failedJobs} pendiente(s) de reintentar.`;
      default:
        return '';
    }
  });

  ngOnInit(): void {
    this.refrescar();
  }

  refrescar(): void {
    this.api
      .status()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (valor) => this.estado.set(valor),
        // Silencioso: es información de apoyo, no puede romper el panel.
        error: () => undefined,
      });
  }

  reconectar(): void {
    this.router.navigateByUrl('/connect-google');
  }

  reanudar(): void {
    this.api
      .resume()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.refrescar(), error: () => undefined });
  }
}
