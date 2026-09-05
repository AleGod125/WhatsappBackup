import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppIconComponent } from './app-icon.component';

/**
 * Un enlace, presentado como enlace y no como una tira de texto azul.
 *
 * SIN PEDIR NADA A NADIE
 * ----------------------
 * No hay descarga de metadatos ni raspado de páginas: eso significaría que
 * abrir una conversación manda peticiones a servidores de terceros con lo que
 * el usuario recibió por WhatsApp, y esta aplicación es local a propósito.
 *
 * Con el dominio basta para que se reconozca de un vistazo. Si algún día el
 * backend guarda título o vista previa, la tarjeta ya los pinta.
 */
@Component({
  selector: 'app-link-card',
  standalone: true,
  imports: [TranslatePipe, AppIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      class="tarjeta"
      [href]="url()"
      target="_blank"
      rel="noopener noreferrer"
      [attr.data-tipo]="tipo()"
      [attr.title]="('media.openInNewTab' | t) + ' · ' + url()"
    >
      <span class="marca" aria-hidden="true">{{ inicial() }}</span>
      <span class="cuerpo">
        <strong>{{ titulo() || dominio() }}</strong>
        <small>{{ corta() }}</small>
      </span>
      <app-icon name="link" class="flecha" />
    </a>
  `,
  styleUrl: './link-card.component.scss',
})
export class LinkCardComponent {
  url = input.required<string>();
  /** Si el backend llegara a guardarlo. Hoy no lo hace, y no pasa nada. */
  titulo = input<string | undefined>(undefined);

  readonly dominio = computed(() => dominioDe(this.url()));

  /**
   * El tipo se usa sólo para el color. No cambia lo que se abre ni añade
   * ninguna petición: es reconocer el sitio de un vistazo.
   */
  readonly tipo = computed(() => clasificar(this.dominio()));

  readonly inicial = computed(() => (this.dominio()[0] ?? '?').toUpperCase());

  /** La URL sin el `https://` ni la barra final, y recortada si es larga. */
  readonly corta = computed(() => {
    const limpia = this.url()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
    return limpia.length > 48 ? `${limpia.slice(0, 47)}…` : limpia;
  });
}

/** Los sitios que se reconocen. Sólo cambia el color. */
export type TipoDeEnlace =
  | 'youtube'
  | 'tiktok'
  | 'facebook'
  | 'instagram'
  | 'x'
  | 'github'
  | 'otro';

export function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    // Una URL que el navegador no sabe leer se enseña tal cual en vez de
    // romper la burbuja entera.
    return url.replace(/^https?:\/\//, '').split('/')[0] ?? url;
  }
}

export function clasificar(dominio: string): TipoDeEnlace {
  const d = dominio.toLowerCase();
  if (d.includes('youtube.') || d === 'youtu.be') return 'youtube';
  if (d.includes('tiktok.')) return 'tiktok';
  if (d.includes('facebook.') || d === 'fb.watch') return 'facebook';
  if (d.includes('instagram.')) return 'instagram';
  if (d === 'x.com' || d.includes('twitter.')) return 'x';
  if (d.includes('github.')) return 'github';
  return 'otro';
}

/**
 * Los enlaces que hay dentro de un texto.
 *
 * Se buscan sólo `http`/`https`. Detectar «www.algo.com» sin esquema obliga a
 * adivinar, y adivinar aquí significa convertir en enlace algo que el
 * remitente escribió como texto.
 */
export function enlacesDe(texto: string | undefined): string[] {
  if (!texto) return [];
  const encontrados = texto.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  // Sin repetidos: el mismo enlace dos veces en un mensaje es una tarjeta.
  return [...new Set(encontrados.map((u) => u.replace(/[.,;:)\]]+$/, '')))];
}
