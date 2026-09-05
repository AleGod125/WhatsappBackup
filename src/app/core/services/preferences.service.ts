import { Injectable, effect, inject, signal } from '@angular/core';
import { ApiClientService } from '../api/api-client.service';
import { I18nService, ModoDeIdioma } from '../i18n/i18n.service';

/**
 * Lo que el usuario ha elegido, y cómo se aplica.
 *
 * DE DONDE SALEN Y DONDE VIVEN
 * ----------------------------
 * La fuente es el backend: las preferencias son del usuario, no del
 * navegador. Pero se guarda una copia en `localStorage` y se aplica **antes**
 * de preguntar: si no, cada carga empezaría con el tema por defecto y saltaría
 * al elegido medio segundo después, que es exactamente el parpadeo que hace
 * que una aplicación parezca barata.
 *
 * COMO SE GUARDA
 * --------------
 * Vista previa inmediata, guardado con freno. Mover un selector de color
 * dispara decenas de cambios por segundo; mandarlos todos sería castigar al
 * servidor por una decisión que el usuario todavía está tomando.
 */

export type Tema = 'system' | 'light' | 'dark' | 'amoled' | 'midnight' | 'custom';
export type Densidad = 'compact' | 'cozy' | 'roomy';
export type Interlineado = 'tight' | 'normal' | 'relaxed';

/** Sólo fuentes que ya están en el sistema. Nada que haya que descargar. */
export const FUENTES = [
  'system',
  'Inter',
  'Roboto',
  'Poppins',
  'Montserrat',
  'Nunito',
  'Arial',
  'Georgia',
] as const;
export type Fuente = (typeof FUENTES)[number];

export const ESCALAS = [0.9, 1, 1.1, 1.25, 1.5] as const;

/** Los colores que se pueden tocar en el tema personalizado. */
export const TOKENS_DE_COLOR = [
  'primary',
  'accent',
  'background',
  'surface',
  'text',
  'border',
  'bubbleIn',
  'bubbleOut',
  'success',
  'warning',
  'danger',
] as const;
export type TokenDeColor = (typeof TOKENS_DE_COLOR)[number];

/** De nuestro nombre corto al token real de la hoja de estilos. */
const VARIABLE: Record<TokenDeColor, string> = {
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

export interface Preferencias {
  theme: Tema;
  custom_theme: Partial<Record<TokenDeColor, string>>;
  language: ModoDeIdioma;
  font_family: Fuente;
  font_scale: number;
  density: Densidad;
  line_height: Interlineado;
  high_contrast: boolean;
  reduce_motion: boolean;
  focus_visible: boolean;
  chat_aliases: Record<string, string>;
  dashboard: { order?: string[]; hidden?: string[] };
}

export const POR_DEFECTO: Preferencias = {
  theme: 'system',
  custom_theme: {},
  language: 'auto',
  font_family: 'system',
  font_scale: 1,
  density: 'cozy',
  line_height: 'normal',
  high_contrast: false,
  reduce_motion: false,
  focus_visible: false,
  chat_aliases: {},
  dashboard: {},
};

const CLAVE_LOCAL = 'wa-backup-prefs';

const MULTIPLICADOR_DE_DENSIDAD: Record<Densidad, number> = {
  compact: 0.75,
  cozy: 1,
  roomy: 1.3,
};
const ALTURA_DE_LINEA: Record<Interlineado, string> = {
  tight: '1.35',
  normal: '1.5',
  relaxed: '1.7',
};
const PILA_DE_FUENTES: Record<Fuente, string> = {
  system: "'Segoe UI', system-ui, sans-serif",
  Inter: "Inter, 'Segoe UI', system-ui, sans-serif",
  Roboto: "Roboto, 'Segoe UI', system-ui, sans-serif",
  Poppins: "Poppins, 'Segoe UI', system-ui, sans-serif",
  Montserrat: "Montserrat, 'Segoe UI', system-ui, sans-serif",
  Nunito: "Nunito, 'Segoe UI', system-ui, sans-serif",
  Arial: 'Arial, Helvetica, sans-serif',
  Georgia: "Georgia, 'Times New Roman', serif",
};

/** Cuánto se espera antes de guardar. */
export const FRENO_MS = 600;

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly api = inject(ApiClientService);
  private readonly i18n = inject(I18nService);

  readonly prefs = signal<Preferencias>({ ...POR_DEFECTO });
  /** Para el «Guardado» discreto. */
  readonly guardando = signal(false);
  readonly guardado = signal(false);

  private temporizador?: ReturnType<typeof setTimeout>;
  private avisoDeGuardado?: ReturnType<typeof setTimeout>;

  constructor() {
    // Lo guardado en el navegador se aplica YA, antes de preguntar a nadie.
    this.prefs.set({ ...POR_DEFECTO, ...leerLocal() });
    // Y cualquier cambio se refleja en el documento, venga de donde venga.
    effect(() => this.aplicar(this.prefs()));
  }

  /** Trae las del servidor, que son las que mandan. */
  cargar(): void {
    this.api.get<{ preferences?: Partial<Preferencias> }>('/preferences').subscribe({
      next: (respuesta) => {
        const guardadas = respuesta?.preferences ?? {};
        this.prefs.set({ ...POR_DEFECTO, ...guardadas });
        escribirLocal(this.prefs());
      },
      // Sin servidor se sigue con lo local: la aplicación es local y quedarse
      // sin tema porque una petición falló no tiene sentido.
      error: () => undefined,
    });
  }

  /** Cambia una preferencia: se ve al instante, se guarda con freno. */
  poner<K extends keyof Preferencias>(clave: K, valor: Preferencias[K]): void {
    this.prefs.update((actuales) => ({ ...actuales, [clave]: valor }));
    escribirLocal(this.prefs());
    this.programarGuardado({ [clave]: valor } as Partial<Preferencias>);
  }

  /** Un color del tema personalizado. Cambiar uno pone el tema en `custom`. */
  ponerColor(token: TokenDeColor, color: string): void {
    const custom = { ...this.prefs().custom_theme, [token]: color };
    this.prefs.update((actuales) => ({ ...actuales, custom_theme: custom, theme: 'custom' }));
    escribirLocal(this.prefs());
    this.programarGuardado({ custom_theme: custom, theme: 'custom' });
  }

  /** El nombre que el usuario le pone a una conversación. */
  ponerAlias(chatId: string, nombre: string): void {
    const alias = { ...this.prefs().chat_aliases };
    const limpio = nombre.trim();
    // Vacío significa «vuelve al original»: se quita, no se guarda vacío.
    if (limpio) alias[chatId] = limpio;
    else delete alias[chatId];
    this.prefs.update((actuales) => ({ ...actuales, chat_aliases: alias }));
    escribirLocal(this.prefs());
    this.programarGuardado({ chat_aliases: alias });
  }

  /** El alias de una conversación, si el usuario le puso uno. */
  alias(chatId: string | undefined): string | undefined {
    if (!chatId) return undefined;
    return this.prefs().chat_aliases[chatId];
  }

  /** Vuelve a los valores predeterminados de una sección, o de todo. */
  restaurar(seccion?: 'appearance' | 'typography' | 'accessibility' | 'dashboard' | 'chats' | 'language'): void {
    const ruta = seccion ? `/preferences?section=${seccion}` : '/preferences';
    this.api.delete<{ preferences?: Partial<Preferencias> }>(ruta).subscribe({
      next: (respuesta) => {
        this.prefs.set({ ...POR_DEFECTO, ...(respuesta?.preferences ?? {}) });
        escribirLocal(this.prefs());
      },
      error: () => undefined,
    });
  }

  private programarGuardado(parcial: Partial<Preferencias>): void {
    this.guardando.set(true);
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      this.temporizador = undefined;
      this.api.put<{ preferences?: Partial<Preferencias> }>('/preferences', parcial).subscribe({
        next: () => this.anunciarGuardado(),
        error: () => this.guardando.set(false),
      });
    }, FRENO_MS);
  }

  private anunciarGuardado(): void {
    this.guardando.set(false);
    this.guardado.set(true);
    if (this.avisoDeGuardado) clearTimeout(this.avisoDeGuardado);
    // Un aviso que se queda para siempre deja de ser un aviso.
    this.avisoDeGuardado = setTimeout(() => this.guardado.set(false), 1800);
  }

  /**
   * Lleva las preferencias al documento.
   *
   * Todo son atributos y variables CSS: el navegador recalcula lo que
   * dependa de ellos y no hay que volver a pintar ningún componente.
   */
  private aplicar(prefs: Preferencias): void {
    if (typeof document === 'undefined') return;
    const raiz = document.documentElement;

    // `system` = sin atributo, que es como la hoja de estilos escucha a
    // `prefers-color-scheme`.
    if (prefs.theme === 'system') raiz.removeAttribute('data-theme');
    else raiz.setAttribute('data-theme', prefs.theme);

    // Los colores personalizados se limpian siempre antes de aplicar: si no,
    // al volver a un tema normal quedarían pegados los de antes.
    for (const token of TOKENS_DE_COLOR) raiz.style.removeProperty(VARIABLE[token]);
    if (prefs.theme === 'custom') {
      for (const [token, color] of Object.entries(prefs.custom_theme)) {
        const variable = VARIABLE[token as TokenDeColor];
        if (variable && color) raiz.style.setProperty(variable, color);
      }
    }

    raiz.style.setProperty('--font-family', PILA_DE_FUENTES[prefs.font_family]);
    raiz.style.setProperty('--font-scale', String(prefs.font_scale));
    raiz.style.setProperty('--density', String(MULTIPLICADOR_DE_DENSIDAD[prefs.density]));
    raiz.style.setProperty('--line-height', ALTURA_DE_LINEA[prefs.line_height]);

    alternar(raiz, 'data-contrast', prefs.high_contrast ? 'high' : null);
    alternar(raiz, 'data-motion', prefs.reduce_motion ? 'reduced' : null);
    alternar(raiz, 'data-focus', prefs.focus_visible ? 'always' : null);

    this.i18n.usar(prefs.language);
  }
}

function alternar(elemento: HTMLElement, atributo: string, valor: string | null): void {
  if (valor === null) elemento.removeAttribute(atributo);
  else elemento.setAttribute(atributo, valor);
}

function leerLocal(): Partial<Preferencias> {
  try {
    const crudo = localStorage.getItem(CLAVE_LOCAL);
    return crudo ? (JSON.parse(crudo) as Partial<Preferencias>) : {};
  } catch {
    // Modo privado, almacenamiento lleno o bloqueado: se sigue con los
    // valores por defecto en vez de dejar la aplicación sin arrancar.
    return {};
  }
}

function escribirLocal(prefs: Preferencias): void {
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(prefs));
  } catch {
    /* Sin caché local la aplicación funciona igual, sólo parpadea al cargar. */
  }
}
