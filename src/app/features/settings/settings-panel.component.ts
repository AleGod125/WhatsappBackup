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
import { SessionExitService } from '../../core/services/session-exit.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { RecoverySectionComponent } from './recovery-section.component';
import { RECUENTO_VACIO, Recuento } from '../dashboard/recuento';
import { I18nService, IDIOMAS, Idioma } from '../../core/i18n/i18n.service';
import {
  Densidad,
  ESCALAS,
  FUENTES,
  Fuente,
  Interlineado,
  PreferencesService,
  TOKENS_DE_COLOR,
  Tema,
  TokenDeColor,
} from '../../core/services/preferences.service';

/**
 * La configuración: un panel, no una pantalla aparte.
 *
 * POR QUE UN CAJON Y NO UNA RUTA
 * ------------------------------
 * Casi todo lo de aquí es visual, y se decide MIRANDO la aplicación. Llevar al
 * usuario a otra pantalla para elegir un color le quita justo lo que necesita
 * para elegirlo. Por eso se abre encima y lo de detrás sigue vivo: cambiar el
 * tema se ve en la lista de conversaciones que hay al lado.
 *
 * NADA DE ESTO PIDE CONFIRMACION
 * ------------------------------
 * Cambiar un color no destruye nada y se deshace cambiándolo otra vez. El
 * único botón que confirma es el de restaurar, porque ése sí borra elecciones.
 */
@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [TranslatePipe, RecoverySectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="velo" (click)="cerrar.emit()"></div>
    <aside class="panel" role="dialog" aria-modal="true" [attr.aria-label]="'settings.title' | t">
      <header>
        <h2>{{ 'settings.title' | t }}</h2>
        <div class="estado" aria-live="polite">
          @if (prefs.guardado()) {
            <span class="ok">{{ 'common.saved' | t }}</span>
          }
        </div>
        <button type="button" class="icono" [attr.aria-label]="'common.close' | t" (click)="cerrar.emit()">
          ✕
        </button>
      </header>

      <div class="buscador">
        <input
          type="search"
          [placeholder]="'settings.search' | t"
          [attr.aria-label]="'settings.search' | t"
          [value]="filtro()"
          (input)="filtro.set($any($event.target).value)"
        />
      </div>

      <div class="contenido">
        @if (visibles().length === 0) {
          <p class="vacio">{{ 'settings.noResults' | t }}</p>
        }

        <!-- ---------------------------------------------------- Apariencia -->
        @if (muestra('appearance')) {
          <section>
            <h3>{{ 'settings.appearance' | t }}</h3>
            <div class="campo">
              <label>{{ 'theme.title' | t }}</label>
              <div class="temas">
                @for (tema of temas; track tema) {
                  <button
                    type="button"
                    class="tema"
                    [class.activo]="prefs.prefs().theme === tema"
                    [attr.aria-pressed]="prefs.prefs().theme === tema"
                    (click)="prefs.poner('theme', tema)"
                  >
                    <span class="muestra" [attr.data-tema]="tema"></span>
                    {{ 'theme.' + tema | t }}
                  </button>
                }
              </div>
            </div>

            <details class="colores" [open]="prefs.prefs().theme === 'custom'">
              <summary>{{ 'theme.customize' | t }}</summary>
              <!-- Cambiar un color pone el tema en «personalizado» solo: el
                   usuario no tiene por qué saber que son dos ajustes. -->
              @for (token of tokens; track token) {
                <div class="color">
                  <label [attr.for]="'color-' + token">{{ etiquetaDeColor(token) | t }}</label>
                  <input
                    type="color"
                    [id]="'color-' + token"
                    [value]="colorDe(token)"
                    (input)="prefs.ponerColor(token, $any($event.target).value)"
                  />
                </div>
              }
              <button type="button" class="secundario" (click)="prefs.restaurar('appearance')">
                {{ 'theme.restore' | t }}
              </button>
            </details>
          </section>
        }

        <!-- --------------------------------------------------------- Idioma -->
        @if (muestra('language')) {
          <section>
            <h3>{{ 'settings.language' | t }}</h3>
            <div class="campo">
              <label for="idioma">{{ 'language.title' | t }}</label>
              <select
                id="idioma"
                [value]="prefs.prefs().language"
                (change)="prefs.poner('language', $any($event.target).value)"
              >
                <option value="auto">{{ 'language.auto' | t }}</option>
                @for (idioma of idiomas; track idioma) {
                  <option [value]="idioma">{{ 'language.' + idioma | t }}</option>
                }
              </select>
            </div>
          </section>
        }

        <!-- ----------------------------------------------------- Tipografía -->
        @if (muestra('typography')) {
          <section>
            <h3>{{ 'settings.typography' | t }}</h3>
            <div class="campo">
              <label for="fuente">{{ 'typography.family' | t }}</label>
              <select
                id="fuente"
                [value]="prefs.prefs().font_family"
                (change)="prefs.poner('font_family', $any($event.target).value)"
              >
                @for (fuente of fuentes; track fuente) {
                  <option [value]="fuente">
                    {{ fuente === 'system' ? ('common.default' | t) : fuente }}
                  </option>
                }
              </select>
            </div>
            <div class="campo">
              <label for="escala">{{ 'typography.scale' | t }}</label>
              <div class="segmentado" id="escala">
                @for (escala of escalas; track escala) {
                  <button
                    type="button"
                    [class.activo]="prefs.prefs().font_scale === escala"
                    [attr.aria-pressed]="prefs.prefs().font_scale === escala"
                    (click)="prefs.poner('font_scale', escala)"
                  >
                    {{ porcentaje(escala) }}
                  </button>
                }
              </div>
            </div>
            <div class="campo">
              <label>{{ 'typography.density' | t }}</label>
              <div class="segmentado">
                @for (densidad of densidades; track densidad) {
                  <button
                    type="button"
                    [class.activo]="prefs.prefs().density === densidad"
                    [attr.aria-pressed]="prefs.prefs().density === densidad"
                    (click)="prefs.poner('density', densidad)"
                  >
                    {{ 'typography.' + etiquetaDeDensidad(densidad) | t }}
                  </button>
                }
              </div>
            </div>
            <div class="campo">
              <label>{{ 'typography.lineHeight' | t }}</label>
              <div class="segmentado">
                @for (alto of interlineados; track alto) {
                  <button
                    type="button"
                    [class.activo]="prefs.prefs().line_height === alto"
                    [attr.aria-pressed]="prefs.prefs().line_height === alto"
                    (click)="prefs.poner('line_height', alto)"
                  >
                    {{ 'typography.' + alto | t }}
                  </button>
                }
              </div>
            </div>
          </section>
        }

        <!-- ------------------------------ Sincronizacion y recuperacion -->
        @if (muestra('recovery')) {
          <app-recovery-section
            [recuento]="recuento()"
            [mensajes]="mensajes()"
            [sincronizando]="sincronizando()"
            [avanzadaDisponible]="avanzadaDisponible()"
            (sincronizar)="sincronizar.emit()"
            (recuperarTodo)="recuperarTodo.emit()"
          />
        }

        <!-- -------------------------------------------------- Accesibilidad -->
        @if (muestra('accessibility')) {
          <section>
            <h3>{{ 'settings.accessibility' | t }}</h3>
            <label class="interruptor">
              <input
                type="checkbox"
                [checked]="prefs.prefs().high_contrast"
                (change)="prefs.poner('high_contrast', $any($event.target).checked)"
              />
              <span>
                <strong>{{ 'accessibility.highContrast' | t }}</strong>
                <small>{{ 'accessibility.highContrastHint' | t }}</small>
              </span>
            </label>
            <label class="interruptor">
              <input
                type="checkbox"
                [checked]="prefs.prefs().reduce_motion"
                (change)="prefs.poner('reduce_motion', $any($event.target).checked)"
              />
              <span>
                <strong>{{ 'accessibility.reduceMotion' | t }}</strong>
                <small>{{ 'accessibility.reduceMotionHint' | t }}</small>
              </span>
            </label>
            <label class="interruptor">
              <input
                type="checkbox"
                [checked]="prefs.prefs().focus_visible"
                (change)="prefs.poner('focus_visible', $any($event.target).checked)"
              />
              <span>
                <strong>{{ 'accessibility.focusVisible' | t }}</strong>
              </span>
            </label>
          </section>
        }

        @if (muestra('account')) {
          <!--
            Cerrar sesion, la SEGUNDA puerta.
            Es el mismo camino que el menu de los tres puntos: mismo servicio,
            misma confirmacion, mismo orden. No hay una segunda version de la
            logica, porque la segunda version es la que se queda a medias.
          -->
          <section>
            <h3>{{ 'settings.account' | t }}</h3>
            @if (confirmandoSalida()) {
              <p class="aviso">{{ 'settings.logoutConfirm' | t }}</p>
              <div class="acciones">
                <button
                  type="button"
                  class="secundario"
                  (click)="confirmandoSalida.set(false)"
                >
                  {{ 'common.cancel' | t }}
                </button>
                <button type="button" class="peligro" [disabled]="saliendo()" (click)="salir()">
                  {{ 'settings.logout' | t }}
                </button>
              </div>
            } @else {
              <button
                type="button"
                class="secundario"
                [disabled]="saliendo()"
                (click)="confirmandoSalida.set(true)"
              >
                {{ 'settings.logout' | t }}
              </button>
            }
          </section>
        }
      </div>

      <footer>
        @if (confirmando()) {
          <p class="aviso">{{ 'settings.resetConfirm' | t }}</p>
          <div class="acciones">
            <button type="button" class="secundario" (click)="confirmando.set(false)">
              {{ 'common.cancel' | t }}
            </button>
            <button type="button" class="peligro" (click)="restaurarTodo()">
              {{ 'common.confirm' | t }}
            </button>
          </div>
        } @else {
          <button type="button" class="secundario" (click)="confirmando.set(true)">
            {{ 'settings.resetAll' | t }}
          </button>
        }
      </footer>
    </aside>
  `,
  styleUrl: './settings-panel.component.scss',
})
export class SettingsPanelComponent {
  readonly prefs = inject(PreferencesService);
  private readonly i18n = inject(I18nService);

  /** El padre lo escucha para desmontar el panel. */
  readonly cerrar = output<void>();

  /**
   * Con qué sección abrirlo.
   *
   * La barra de progreso de la lista abre directamente en «Sincronización y
   * recuperación»: si abriera por el principio, el usuario tendría que buscar
   * lo que acaba de pedir.
   */
  readonly seccionInicial = input<string>('');
  readonly recuento = input<Recuento>(RECUENTO_VACIO);
  readonly mensajes = input<number>(0);
  readonly sincronizando = input<boolean>(false);
  readonly avanzadaDisponible = input<boolean>(false);
  readonly sincronizar = output<void>();
  readonly recuperarTodo = output<void>();
  readonly filtro = signal('');
  readonly confirmando = signal(false);

  readonly temas: Tema[] = ['system', 'light', 'dark', 'amoled', 'midnight', 'custom'];
  readonly idiomas: readonly Idioma[] = IDIOMAS;
  readonly fuentes: readonly Fuente[] = FUENTES;
  readonly escalas: readonly number[] = ESCALAS;
  readonly densidades: Densidad[] = ['compact', 'cozy', 'roomy'];
  readonly interlineados: Interlineado[] = ['tight', 'normal', 'relaxed'];
  readonly tokens: readonly TokenDeColor[] = TOKENS_DE_COLOR;

  /** La confirmacion de salir, aparte de la de restaurar ajustes. */
  readonly confirmandoSalida = signal(false);
  readonly saliendo = signal(false);

  private readonly salida = inject(SessionExitService);
  private readonly destroyRefSalida = inject(DestroyRef);

  /**
   * Cierra la sesion. EXACTAMENTE el mismo flujo que el menu del encabezado.
   *
   * No desvincula WhatsApp: la proxima vez que este usuario entre, si su
   * vinculacion sigue valida, va directo al panel sin escanear nada.
   */
  salir(): void {
    if (this.saliendo()) return;
    this.saliendo.set(true);
    this.salida
      .salir()
      .pipe(takeUntilDestroyed(this.destroyRefSalida))
      .subscribe({
        next: () => this.saliendo.set(false),
        error: () => this.saliendo.set(false),
        complete: () => this.saliendo.set(false),
      });
  }

  /** Las secciones que existen, para poder filtrarlas por nombre. */
  private readonly secciones = [
    'recovery',
    'appearance',
    'language',
    'typography',
    'accessibility',
    'account',
  ] as const;

  /**
   * Qué secciones se ven con el filtro puesto.
   *
   * Se busca por el nombre TRADUCIDO, no por la clave: el usuario escribe
   * «idioma», no `settings.language`.
   */
  readonly visibles = computed(() => {
    const texto = this.filtro().trim().toLowerCase();
    if (!texto) {
      // Abierto desde la barra de progreso: sólo esa sección, para no obligar
      // a buscar entre las demás lo que se acaba de pedir.
      const pedida = this.seccionInicial();
      if (pedida && (this.secciones as readonly string[]).includes(pedida)) {
        return [pedida] as unknown as (typeof this.secciones)[number][];
      }
      return [...this.secciones];
    }
    const t = this.i18n.t();
    return this.secciones.filter((seccion) =>
      t(`settings.${seccion}`).toLowerCase().includes(texto),
    );
  });

  muestra(seccion: string): boolean {
    return (this.visibles() as string[]).includes(seccion);
  }

  colorDe(token: TokenDeColor): string {
    const elegido = this.prefs.prefs().custom_theme[token];
    if (elegido) return elegido;
    // Lo que el tema actual esté pintando ahora mismo, para que el selector
    // no arranque en negro cuando el usuario no ha tocado nada.
    return leerTokenDelDocumento(token);
  }

  etiquetaDeColor(token: TokenDeColor): string {
    return `theme.${token}`;
  }

  etiquetaDeDensidad(densidad: Densidad): string {
    return densidad === 'compact' ? 'compact' : densidad === 'cozy' ? 'cozy' : 'roomy';
  }

  porcentaje(escala: number): string {
    return `${Math.round(escala * 100)}%`;
  }

  restaurarTodo(): void {
    this.confirmando.set(false);
    this.prefs.restaurar();
  }
}

const VARIABLE_DE: Record<TokenDeColor, string> = {
  primary: '--color-primary',
  accent: '--color-accent',
  background: '--color-background',
  surface: '--color-surface',
  text: '--color-text',
  border: '--color-border',
  bubbleIn: '--chat-incoming-bg',
  bubbleOut: '--chat-outgoing-bg',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
};

/**
 * El valor que el tema está aplicando ahora.
 *
 * `<input type="color">` sólo entiende `#rrggbb`. Lo que no lo sea —un
 * `rgba()` de un borde, por ejemplo— se sustituye por un gris neutro en vez de
 * dejar el selector en negro, que parecería un color elegido.
 */
function leerTokenDelDocumento(token: TokenDeColor): string {
  if (typeof document === 'undefined') return '#888888';
  const valor = getComputedStyle(document.documentElement)
    .getPropertyValue(VARIABLE_DE[token])
    .trim();
  return /^#[0-9a-f]{6}$/i.test(valor) ? valor : '#888888';
}
