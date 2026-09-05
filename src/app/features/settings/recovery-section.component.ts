import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import {
  WebCompanionService,
  WebCompanionStatus,
} from '../../core/services/web-companion.service';
import { Recuento, quedaTrabajo } from '../dashboard/recuento';

/**
 * Sincronización y recuperación: aquí vive TODO el detalle.
 *
 * POR QUE AQUI Y NO EN LA BARRA LATERAL
 * -------------------------------------
 * La lista de conversaciones es lo que el usuario viene a ver. El estado de
 * la recuperación es importante, pero es algo que se consulta, no algo que se
 * mira todo el rato — así que se resume en una línea junto a la lista y se
 * explica entero aquí.
 *
 * LA RECUPERACION AVANZADA ES OPCIONAL, Y SE NOTA
 * -----------------------------------------------
 * Vincular un segundo dispositivo ayuda con un problema concreto: al vincular,
 * WhatsApp no entrega una referencia de cada conversación, y sin referencia no
 * se le puede pedir el historial anterior. El segundo dispositivo sí las ve.
 *
 * Pero es una MEJORA, no un requisito, y el producto entero funciona sin ella.
 * Por eso:
 *
 * * el código QR **no aparece solo**: hace falta pulsar «vincular»;
 * * si no queda ninguna conversación esperando referencia, la opción ni
 *   siquiera se ofrece — no tendría nada que arreglar;
 * * desactivarla **para el proceso, no desvincula el teléfono**. Son cosas
 *   distintas, y confundirlas costaría escanear otra vez.
 */
@Component({
  selector: 'app-recovery-section',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="recuperacion">
      <h3>{{ 'settings.recovery' | t }}</h3>

      <!-- ------------------------------------------------- Lo que hay hoy -->
      <dl class="cifras">
        <div><dt>{{ 'recovery.recovered' | t }}</dt><dd>{{ recuento().recuperados }}</dd></div>
        <div><dt>{{ 'recovery.recovering' | t }}</dt><dd>{{ recuento().recuperandose }}</dd></div>
        <div><dt>{{ 'recovery.retrying' | t }}</dt><dd>{{ recuento().reintentando }}</dd></div>
        <div><dt>{{ 'recovery.waitingSeed' | t }}</dt><dd>{{ recuento().esperandoReferencia }}</dd></div>
        <div><dt>{{ 'recovery.noMessages' | t }}</dt><dd>{{ recuento().sinMensajes }}</dd></div>
        @if (recuento().error) {
          <div class="malo"><dt>{{ 'recovery.error' | t }}</dt><dd>{{ recuento().error }}</dd></div>
        }
        <div class="fuerte"><dt>{{ 'recovery.messages' | t }}</dt><dd>{{ mensajes() }}</dd></div>
      </dl>

      <div class="acciones">
        <button type="button" [disabled]="sincronizando()" (click)="sincronizar.emit()">
          {{ 'recovery.syncNow' | t }}
        </button>
        <button
          type="button"
          class="secundario"
          [disabled]="sincronizando() || !hayTrabajo()"
          (click)="recuperarTodo.emit()"
        >
          {{ 'recovery.fullRecovery' | t }}
        </button>
      </div>

      <!-- --------------------------------------- Recuperación avanzada -->
      @if (ofreceAvanzada()) {
        <div class="avanzada">
          <header>
            <h4>{{ 'advanced.title' | t }}</h4>
            <span class="etiqueta">{{ 'advanced.optional' | t }}</span>
          </header>
          <p class="explica">{{ 'advanced.explain' | t }}</p>
          <p class="pendientes">
            {{ 'advanced.pending' | t: { n: recuento().esperandoReferencia } }}
          </p>

          @if (activa()) {
            <p class="estado-activo">{{ 'advanced.active' | t }}</p>
            <button type="button" class="secundario" (click)="desactivar()">
              {{ 'advanced.disable' | t }}
            </button>
            <p class="fino">{{ 'advanced.disableHint' | t }}</p>
          } @else if (mostrandoQr()) {
            @if (qrUrl(); as url) {
              <div class="qr">
                <img [src]="url" [attr.alt]="'advanced.qrAlt' | t" />
              </div>
              <p class="pasos">{{ 'advanced.steps' | t }}</p>
            } @else {
              <p class="fino">{{ 'advanced.waitingQr' | t }}</p>
            }
            <button type="button" class="secundario" (click)="cancelar()">
              {{ 'common.cancel' | t }}
            </button>
          } @else {
            <!-- El codigo NO se ensena hasta aqui. Verlo sin haberlo pedido es
                 lo que le daba aspecto de paso obligatorio. -->
            <button type="button" (click)="activar()">{{ 'advanced.link' | t }}</button>
          }

          @if (error(); as e) {
            <p class="malo">{{ e }}</p>
          }
        </div>
      } @else if (avanzadaDisponible()) {
        <p class="fino">{{ 'advanced.notNeeded' | t }}</p>
      }
    </section>
  `,
  styles: [
    `
      .cifras {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 2px 12px;
        margin: 0 0 12px;
      }
      .cifras > div {
        display: contents;
      }
      dt,
      dd {
        margin: 0;
        font-size: var(--font-size-sm);
      }
      dt {
        color: var(--text-muted);
      }
      dd {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .fuerte dt,
      .fuerte dd {
        font-weight: 600;
      }
      .malo dt,
      .malo dd,
      p.malo {
        color: var(--danger, #d9534f);
      }
      .acciones {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .avanzada {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid var(--border);
        display: grid;
        gap: 8px;
        justify-items: start;
      }
      .avanzada header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      h4 {
        margin: 0;
        font-size: var(--font-size-sm);
        font-weight: 600;
      }
      .etiqueta {
        font-size: var(--font-size-xs);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid var(--border);
        color: var(--text-muted);
      }
      .explica,
      .pendientes,
      .pasos,
      .fino {
        margin: 0;
        font-size: var(--font-size-xs);
        color: var(--text-muted);
        max-width: 46ch;
      }
      .estado-activo {
        margin: 0;
        font-size: var(--font-size-sm);
      }
      .qr {
        padding: 10px;
        border-radius: 8px;
        background: #fff;
      }
      .qr img {
        display: block;
        width: 190px;
        height: 190px;
      }
    `,
  ],
})
export class RecoverySectionComponent {
  private readonly web = inject(WebCompanionService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly recuento = input.required<Recuento>();
  readonly mensajes = input<number>(0);
  readonly sincronizando = input<boolean>(false);
  /** Si el segundo dispositivo está disponible en esta instalación. */
  readonly avanzadaDisponible = input<boolean>(false);

  readonly sincronizar = output<void>();
  readonly recuperarTodo = output<void>();

  readonly mostrandoQr = signal(false);
  readonly estado = signal<WebCompanionStatus | null>(null);
  readonly error = signal<string | null>(null);

  readonly hayTrabajo = computed(() => quedaTrabajo(this.recuento()));

  /**
   * Si tiene sentido ofrecerla.
   *
   * Sin conversaciones esperando referencia no hay nada que mejorar, así que
   * pedir un segundo código sería molestar por costumbre.
   */
  readonly ofreceAvanzada = computed(
    () => this.avanzadaDisponible() && this.recuento().esperandoReferencia > 0,
  );

  readonly activa = computed(() => {
    const e = this.estado();
    return !!e && (e.running || e.state === 'ready' || e.state === 'connected');
  });

  readonly qrUrl = computed(() => {
    const e = this.estado();
    // `qrAvailable` y no solo la generacion: entre pedir el arranque y que el
    // codigo exista pasan segundos, y pintar una imagen que todavia no esta
    // deja un hueco roto en su sitio.
    if (!e?.qrAvailable || !e.qrGeneration || !this.web) return null;
    return this.web.qrImageUrl(e.qrGeneration);
  });

  activar(): void {
    if (!this.web) return;
    this.error.set(null);
    this.mostrandoQr.set(true);
    this.web
      .start()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (estado) => this.estado.set(estado),
        error: (e: unknown) => this.error.set(String((e as Error)?.message ?? e)),
      });
  }

  cancelar(): void {
    // Se deja de ENSENAR el código. No se borra la sesión guardada ni se
    // desvincula nada: cerrar un panel no puede tener ese efecto.
    this.mostrandoQr.set(false);
  }

  desactivar(): void {
    if (!this.web) return;
    this.error.set(null);
    this.mostrandoQr.set(false);
    this.web
      .stop()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (estado) => this.estado.set(estado),
        error: (e: unknown) => this.error.set(String((e as Error)?.message ?? e)),
      });
  }
}
