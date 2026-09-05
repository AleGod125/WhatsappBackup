import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import es from '../../../assets/i18n/es.json';
import en from '../../../assets/i18n/en.json';
import pt from '../../../assets/i18n/pt.json';
import fr from '../../../assets/i18n/fr.json';
import de from '../../../assets/i18n/de.json';
import it from '../../../assets/i18n/it.json';

/**
 * Los idiomas de la aplicación.
 *
 * Se importan los seis catálogos en el paquete en vez de pedirlos por red.
 * Pesan poco, y así cambiar de idioma es instantáneo y funciona aunque el
 * backend no conteste: la aplicación es local, y una pantalla que se queda en
 * blanco esperando un JSON de traducciones es un fallo que no hace falta
 * tener.
 */
export const IDIOMAS = ['es', 'en', 'pt', 'fr', 'de', 'it'] as const;
export type Idioma = (typeof IDIOMAS)[number];

/** `auto` sigue al navegador; el resto manda sobre él. */
export type ModoDeIdioma = 'auto' | Idioma;

const CATALOGOS: Record<Idioma, unknown> = { es, en, pt, fr, de, it };

/** Si el navegador habla algo que no tenemos, se cae aquí. */
export const IDIOMA_POR_DEFECTO: Idioma = 'es';

/**
 * El idioma del navegador, reducido al que sabemos hablar.
 *
 * `navigator.language` da cosas como `es-419`, `pt-BR` o `en-GB`: sólo importa
 * la primera parte. Lo que no reconocemos NO se fuerza a inglés por costumbre
 * — se usa el idioma por defecto de la aplicación.
 */
export function idiomaDelNavegador(idiomas: readonly string[] | undefined): Idioma {
  for (const bruto of idiomas ?? []) {
    const corto = String(bruto).toLowerCase().split('-')[0];
    if ((IDIOMAS as readonly string[]).includes(corto)) return corto as Idioma;
  }
  return IDIOMA_POR_DEFECTO;
}

/** Busca `a.b.c` dentro del catálogo. */
function buscar(catalogo: unknown, ruta: string): string | undefined {
  let nodo: unknown = catalogo;
  for (const parte of ruta.split('.')) {
    if (!nodo || typeof nodo !== 'object') return undefined;
    nodo = (nodo as Record<string, unknown>)[parte];
  }
  return typeof nodo === 'string' ? nodo : undefined;
}

/** Sustituye `{{nombre}}` por lo que venga en los parámetros. */
function rellenar(texto: string, valores?: Record<string, string | number>): string {
  if (!valores) return texto;
  return texto.replace(/\{\{(\w+)\}\}/g, (entero, clave: string) =>
    clave in valores ? String(valores[clave]) : entero,
  );
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly http = inject(HttpClient, { optional: true });

  /** Lo que el usuario eligió: un idioma concreto, o seguir al navegador. */
  readonly modo = signal<ModoDeIdioma>('auto');

  /** El idioma que se está usando de verdad, ya resuelto. */
  readonly idioma = computed<Idioma>(() => {
    const modo = this.modo();
    if (modo !== 'auto') return modo;
    return idiomaDelNavegador(
      typeof navigator === 'undefined' ? undefined : navigator.languages ?? [navigator.language],
    );
  });

  /**
   * El texto de una clave.
   *
   * Si falta en el idioma actual se cae al castellano, y si tampoco está se
   * devuelve **la clave**. No se devuelve una cadena vacía a propósito: un
   * hueco en la pantalla no se ve, y una clave sí — se arregla el mismo día.
   */
  readonly t = computed(() => {
    const catalogo = CATALOGOS[this.idioma()];
    return (ruta: string, valores?: Record<string, string | number>): string => {
      const texto = buscar(catalogo, ruta) ?? buscar(CATALOGOS[IDIOMA_POR_DEFECTO], ruta);
      return rellenar(texto ?? ruta, valores);
    };
  });

  /** El locale para fechas y números: el idioma que se esté usando. */
  readonly locale = computed(() => this.idioma());

  usar(modo: ModoDeIdioma): void {
    this.modo.set(modo);
    if (typeof document !== 'undefined') {
      // Para el navegador, los lectores de pantalla y la separación de
      // palabras. Sin esto la página sigue diciendo que está en otro idioma.
      document.documentElement.lang = this.idioma();
    }
  }

  /** Una fecha, en el formato del idioma en uso. */
  fecha(valor: Date | string | number | undefined, opciones?: Intl.DateTimeFormatOptions): string {
    if (valor === undefined || valor === null || valor === '') return '';
    const fecha = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '';
    return new Intl.DateTimeFormat(this.locale(), opciones ?? { dateStyle: 'medium' }).format(fecha);
  }

  /** Un número, con el separador de miles del idioma en uso. */
  numero(valor: number | undefined): string {
    if (typeof valor !== 'number' || Number.isNaN(valor)) return '';
    return new Intl.NumberFormat(this.locale()).format(valor);
  }

  /**
   * Un tamaño de archivo legible.
   *
   * Se usan las unidades que espera cada idioma a través de `Intl`, pero la
   * elección de unidad se hace aquí: un archivo de 1,4 MB dicho en bytes no
   * lo lee nadie.
   */
  tamano(bytes: number | undefined): string {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
    const unidades = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
    let valor = bytes;
    let i = 0;
    while (valor >= 1024 && i < unidades.length - 1) {
      valor /= 1024;
      i += 1;
    }
    return new Intl.NumberFormat(this.locale(), {
      style: 'unit',
      unit: unidades[i],
      unitDisplay: 'short',
      maximumFractionDigits: valor < 10 && i > 0 ? 1 : 0,
    }).format(valor);
  }
}
