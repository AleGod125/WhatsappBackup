import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppIconComponent } from './app-icon.component';
import { I18nService } from '../../core/i18n/i18n.service';

/**
 * Un archivo adjunto, presentado como archivo.
 *
 * Antes se veía el nombre suelto y poco más, y no había forma de saber si era
 * un PDF de dos páginas o un ZIP de cien megas sin abrirlo. Aquí se dice el
 * tipo, el tamaño y qué se puede hacer con él, y el tamaño va en las unidades
 * del idioma en uso.
 *
 * NO toca la descarga: recibe la URL que la capa de media ya resolvió.
 */
@Component({
  selector: 'app-document-card',
  standalone: true,
  imports: [TranslatePipe, AppIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tarjeta" [attr.data-tipo]="familia()">
      <span class="icono" aria-hidden="true">
        <app-icon name="document" />
        <b>{{ extension() || '?' }}</b>
      </span>

      <span class="cuerpo">
        <strong [title]="nombre()">{{ nombre() }}</strong>
        <small>
          {{ descripcion() }}
          @if (tamanoLegible()) {
            · {{ tamanoLegible() }}
          }
        </small>
      </span>

      @if (disponible()) {
        <a
          class="accion"
          [href]="url()"
          target="_blank"
          rel="noopener noreferrer"
          [attr.aria-label]="'common.open' | t"
          [title]="'media.openInNewTab' | t"
        >
          {{ 'common.open' | t }}
        </a>
      } @else {
        <span class="estado">
          {{ (estado() === 'expired' ? 'media.expired' : 'media.unavailable') | t }}
        </span>
      }
    </div>
  `,
  styleUrl: './document-card.component.scss',
})
export class DocumentCardComponent {
  nombre = input.required<string>();
  url = input<string | undefined>(undefined);
  bytes = input<number | undefined>(undefined);
  estado = input<'loading' | 'ready' | 'downloaded' | 'unavailable' | 'expired' | undefined>(
    'ready',
  );

  private readonly i18n = inject(I18nService);

  readonly extension = computed(() => extensionDe(this.nombre()));
  readonly familia = computed(() => familiaDe(this.extension()));

  readonly disponible = computed(
    () => !!this.url() && this.estado() !== 'unavailable' && this.estado() !== 'expired',
  );

  /** El tamaño en las unidades del idioma en uso. */
  readonly tamanoLegible = computed(() => this.i18n.tamano(this.bytes()));

  readonly descripcion = computed(() => {
    const ext = this.extension();
    return ext ? ext.toUpperCase() : this.i18n.t()('media.document');
  });
}

/** Las familias que se reconocen. Sólo cambia el color del icono. */
export type FamiliaDeArchivo = 'pdf' | 'texto' | 'hoja' | 'diapositivas' | 'comprimido' | 'otro';

export function extensionDe(nombre: string): string {
  const limpio = (nombre ?? '').trim();
  const punto = limpio.lastIndexOf('.');
  // Un punto al principio es un archivo oculto, no una extensión.
  if (punto <= 0 || punto === limpio.length - 1) return '';
  return limpio.slice(punto + 1).toLowerCase().slice(0, 5);
}

export function familiaDe(extension: string): FamiliaDeArchivo {
  const e = extension.toLowerCase();
  if (e === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(e)) return 'texto';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(e)) return 'hoja';
  if (['ppt', 'pptx', 'odp'].includes(e)) return 'diapositivas';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return 'comprimido';
  return 'otro';
}
