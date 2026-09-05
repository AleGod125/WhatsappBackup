import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from './i18n.service';

/**
 * `{{ 'settings.title' | t }}` en las plantillas.
 *
 * NO es puro a propósito. Un pipe puro se evalúa una vez y se queda con el
 * resultado, así que al cambiar de idioma la pantalla seguiría en el anterior
 * hasta recargar — y el cambio en caliente es justo lo que se pide. El coste
 * es una búsqueda en un objeto por texto visible, que no se nota.
 *
 * Con parámetros: `{{ 'recovery.summary' | t: { done: 35, total: 51 } }}`.
 */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(clave: string, valores?: Record<string, string | number>): string {
    return this.i18n.t()(clave, valores);
  }
}
