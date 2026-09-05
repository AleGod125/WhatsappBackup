import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Recuento, quedaTrabajo } from './recuento';

/**
 * Una sola línea de estado, debajo de la lista de conversaciones.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * Debajo de la lista había tres componentes apilados: la tarjeta de
 * recuperación, el panel de puesta en marcha —con un código QR grande dentro—
 * y el panel de sincronización con sus dos botones. Entre los tres se comían
 * media barra lateral, y el código QR aparecía sin que nadie lo hubiera pedido:
 * daba la impresión de ser un paso obligatorio. No lo es.
 *
 * LA REGLA
 * --------
 * **La lista de conversaciones manda.** Aquí caben una barra, una cifra y un
 * estado. Todo lo demás —los botones, el detalle por categoría, la vinculación
 * opcional del segundo dispositivo— vive en los ajustes, a un clic.
 *
 * LA BARRA DICE LA VERDAD
 * -----------------------
 * Avanza con **conversaciones resueltas sobre conversaciones totales**, que es
 * una fracción con denominador conocido. No con mensajes: cuántos mensajes hay
 * en total no se sabe hasta haberlos traído, así que una barra de mensajes
 * sería un porcentaje inventado.
 *
 * Y «resuelta» incluye las que el servidor contestó sin nada que traer: están
 * tan terminadas como las sincronizadas, y contarlas como pendientes dejaría
 * la copia marcada como incompleta para siempre.
 */
@Component({
  selector: 'app-progress-toolbar',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <button
        type="button"
        class="barra-estado"
        [attr.aria-label]="'recovery.openDetail' | t"
        (click)="abrirDetalle.emit()"
      >
        <span class="linea">
          <span class="punto" [class.quieto]="!enMarcha()"></span>
          <span class="texto">{{ titulo() | t }}</span>
          @if (mensajes() > 0) {
            <span class="cifra">{{ mensajes() }} · {{ resueltos() }}/{{ recuento().total }}</span>
          } @else {
            <span class="cifra">{{ resueltos() }}/{{ recuento().total }}</span>
          }
        </span>
        <span
          class="progreso"
          role="progressbar"
          [attr.aria-valuenow]="porcentaje()"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <i [style.width.%]="porcentaje()"></i>
        </span>
      </button>
    }
  `,
  styles: [
    `
      /* Dos líneas como mucho. Lo que ocupe de más se lo quita a la lista. */
      .barra-estado {
        display: grid;
        gap: 5px;
        width: 100%;
        max-height: 56px;
        padding: 8px 12px;
        border: 0;
        border-top: 1px solid var(--border);
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
        font: inherit;
      }
      .barra-estado:hover {
        background: var(--surface-hover, rgba(127, 127, 127, 0.08));
      }
      .linea {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
      }
      .texto {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--font-size-xs);
        color: var(--text-muted);
      }
      .cifra {
        font-size: var(--font-size-xs);
        font-variant-numeric: tabular-nums;
        color: var(--text-muted);
      }
      .punto {
        flex: none;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--accent);
        animation: latido 1.6s ease-in-out infinite;
      }
      .punto.quieto {
        background: var(--text-muted);
        animation: none;
      }
      .progreso {
        display: block;
        height: 3px;
        border-radius: 2px;
        background: var(--border);
        overflow: hidden;
      }
      .progreso i {
        display: block;
        height: 100%;
        background: var(--accent);
        transition: width 0.4s ease;
      }
      /* Respeta la preferencia de movimiento reducido del sistema y la de la
         aplicación: un punto latiendo sin parar molesta a quien lo pidió. */
      :host-context([data-motion='reduced']) .punto {
        animation: none;
      }
      @media (prefers-reduced-motion: reduce) {
        .punto {
          animation: none;
        }
      }
      @keyframes latido {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.35;
        }
      }
    `,
  ],
})
export class ProgressToolbarComponent {
  readonly recuento = input.required<Recuento>();
  /**
   * Mensajes ya guardados.
   *
   * Se enseña como CIFRA, nunca como porcentaje: cuántos mensajes hay en total
   * no se sabe hasta haberlos traído, así que «4.035 de ?» no se puede pintar
   * como una fracción sin inventarse el denominador.
   */
  readonly mensajes = input<number>(0);

  /** El usuario quiere el detalle: se abre en los ajustes, no aquí. */
  readonly abrirDetalle = output<void>();

  /** Sin conversaciones no hay nada que contar y la barra sobra. */
  readonly visible = computed(() => this.recuento().total > 0);

  readonly enMarcha = computed(() => quedaTrabajo(this.recuento()));

  /**
   * Resueltas de verdad: sincronizadas más las que no tenían nada que traer.
   */
  readonly resueltos = computed(
    () => this.recuento().recuperados + this.recuento().sinMensajes,
  );

  readonly porcentaje = computed(() => {
    const total = this.recuento().total;
    if (total <= 0) return 0;
    return Math.round((this.resueltos() / total) * 100);
  });

  /**
   * Qué se está haciendo, en las palabras del usuario.
   *
   * Nada de «seed», «WAMID» ni «ON_DEMAND»: eso puede aparecer en los ajustes
   * avanzados, no en la barra lateral.
   */
  readonly titulo = computed(() => {
    const r = this.recuento();
    // Claves propias, y no las de la tarjeta antigua: aquellas son
    // fragmentos pensados para una lista («recuperándose») y sueltos en una
    // barra se leen como un error de redaccion.
    if (!quedaTrabajo(r)) return 'recovery.stateDone';
    if (r.error > 0) return 'recovery.stateErrors';
    if (r.recuperandose > 0) return 'recovery.stateRecovering';
    if (r.reintentando > 0) return 'recovery.stateRetrying';
    if (r.esperandoReferencia > 0) return 'recovery.statePreparing';
    return 'recovery.background';
  });
}
