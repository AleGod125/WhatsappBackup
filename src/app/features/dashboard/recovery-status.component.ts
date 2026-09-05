import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppIconComponent } from '../../shared/components/app-icon.component';
import { PreferencesService } from '../../core/services/preferences.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { Recuento, quedaTrabajo } from './recuento';

/**
 * El estado de la copia, en una sola tarjeta pequeña.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * Se midió en uso real: había cuatro bloques contando lo mismo a la vez
 * —«preparando conversaciones», «recuperación parcial», «copia incompleta» y
 * «sincronizando»— y entre todos se comían casi la mitad del panel lateral.
 * En una lista con pocas conversaciones, el estado tapaba justo lo que el
 * usuario había venido a ver.
 *
 * LA REGLA
 * --------
 * **La lista de conversaciones manda.** El estado se ve, pero no estorba: una
 * línea de progreso, tres cifras, y el detalle sólo si se pide.
 *
 * TRES TAMAÑOS
 * ------------
 * `abierto`    la tarjeta compacta con la barra y el resumen;
 * `detalle`    además, cada categoría con su nombre;
 * `oculto`     una sola línea que recuerda que se sigue trabajando.
 *
 * Lo que el usuario elija se guarda: si decidió que le estorba, no puede
 * volver a abrirse solo en el siguiente evento — y llegan varios por minuto.
 */
@Component({
  selector: 'app-recovery-status',
  standalone: true,
  imports: [TranslatePipe, AppIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      @if (oculto()) {
        <!-- Colapsado: una línea. Sigue diciendo que hay trabajo, sin ocupar
             sitio que le hace falta a la lista. -->
        <button type="button" class="minimo" (click)="mostrar()">
          <span class="punto" [class.quieto]="!enMarcha()"></span>
          <span class="texto">
            {{ 'recovery.background' | t }} · {{ recuento().recuperados }}/{{ recuento().total }}
          </span>
          <app-icon name="chevron" class="flecha" />
        </button>
      } @else {
        <section class="tarjeta" role="status">
          <header>
            <span class="punto" [class.quieto]="!enMarcha()"></span>
            <h3>{{ titulo() | t }}</h3>
            <button
              type="button"
              class="icono"
              [attr.aria-label]="'recovery.hide' | t"
              (click)="esconder()"
            >
              —
            </button>
          </header>

          <p class="resumen">{{ resumen() }}</p>

          <div class="barra" role="progressbar" [attr.aria-valuenow]="porcentaje()">
            <i [style.width.%]="porcentaje()"></i>
          </div>

          @if (detalle()) {
            <ul class="detalle">
              @for (fila of categorias(); track fila.clave) {
                <li [class.malo]="fila.clave === 'error'">
                  <b>{{ fila.cuantas }}</b> {{ fila.etiqueta | t }}
                </li>
              }
            </ul>
            <p class="fino">{{ 'recovery.noReload' | t }}</p>
          }

          <button type="button" class="detalles" (click)="alternarDetalle()">
            {{ (detalle() ? 'recovery.hide' : 'recovery.details') | t }}
            <app-icon name="chevron" class="flecha" [class.arriba]="detalle()" />
          </button>
        </section>
      }
    }
  `,
  styleUrl: './recovery-status.component.scss',
})
export class RecoveryStatusComponent {
  recuento = input.required<Recuento>();

  private readonly prefs = inject(PreferencesService);
  // El pipe sirve en la plantilla; aquí hace falta componer una frase con
  // varias claves, así que se usa el servicio directamente.
  private readonly i18n = inject(I18nService);

  /** Lo que el usuario decidió, recordado entre sesiones. */
  readonly oculto = computed(() => this.prefs.prefs().dashboard.hidden?.includes(CLAVE) ?? false);
  readonly detalle = computed(
    () => this.prefs.prefs().dashboard.order?.includes(CLAVE_DETALLE) ?? false,
  );

  /**
   * Se enseña mientras quede algo por hacer, y también un rato después con el
   * resultado final: desaparecer de golpe deja al usuario sin saber si acabó
   * bien o si el panel se rompió.
   */
  readonly visible = computed(() => this.recuento().total > 0);

  readonly enMarcha = computed(
    () => this.recuento().recuperandose + this.recuento().reintentando > 0,
  );

  readonly titulo = computed(() => {
    if (this.enMarcha()) return 'recovery.preparing';
    return quedaTrabajo(this.recuento()) ? 'recovery.incomplete' : 'recovery.complete';
  });

  readonly porcentaje = computed(() => {
    const r = this.recuento();
    if (r.total === 0) return 0;
    // «Sin mensajes disponibles» cuenta como terminado: el servidor contestó
    // y no había nada. Si no, la barra se quedaría a medias para siempre.
    return Math.min(100, Math.round(((r.recuperados + r.sinMensajes) / r.total) * 100));
  });

  /**
   * La línea de resumen.
   *
   * Se construye con las cifras que NO son cero: decir «0 reintentando» ocupa
   * sitio para no informar de nada.
   */
  readonly resumen = computed(() => {
    const r = this.recuento();
    const t = this.i18n.t();
    const partes = [t('recovery.available', { done: r.recuperados, total: r.total })];
    if (r.recuperandose) partes.push(`${r.recuperandose} ${t('recovery.recovering')}`);
    if (r.esperandoReferencia) partes.push(`${r.esperandoReferencia} ${t('recovery.waitingSeed')}`);
    return partes.join(' · ');
  });

  readonly categorias = computed(() => {
    const r = this.recuento();
    return (
      [
        { clave: 'recuperados', cuantas: r.recuperados, etiqueta: 'recovery.recovered' },
        { clave: 'recuperandose', cuantas: r.recuperandose, etiqueta: 'recovery.recovering' },
        { clave: 'reintentando', cuantas: r.reintentando, etiqueta: 'recovery.retrying' },
        {
          clave: 'esperando',
          cuantas: r.esperandoReferencia,
          etiqueta: 'recovery.waitingSeed',
        },
        { clave: 'sinMensajes', cuantas: r.sinMensajes, etiqueta: 'recovery.noMessages' },
        { clave: 'error', cuantas: r.error, etiqueta: 'recovery.error' },
      ] as const
    ).filter((fila) => fila.cuantas > 0);
  });

  esconder(): void {
    this.guardarOculto(true);
  }
  mostrar(): void {
    this.guardarOculto(false);
  }
  alternarDetalle(): void {
    const orden = new Set(this.prefs.prefs().dashboard.order ?? []);
    if (orden.has(CLAVE_DETALLE)) orden.delete(CLAVE_DETALLE);
    else orden.add(CLAVE_DETALLE);
    this.prefs.poner('dashboard', {
      ...this.prefs.prefs().dashboard,
      order: [...orden],
    });
  }

  private guardarOculto(oculto: boolean): void {
    const ocultos = new Set(this.prefs.prefs().dashboard.hidden ?? []);
    if (oculto) ocultos.add(CLAVE);
    else ocultos.delete(CLAVE);
    this.prefs.poner('dashboard', {
      ...this.prefs.prefs().dashboard,
      hidden: [...ocultos],
    });
  }

}

/** Cómo se recuerda la decisión del usuario dentro de las preferencias. */
const CLAVE = 'recovery';
const CLAVE_DETALLE = 'recovery:detalle';
