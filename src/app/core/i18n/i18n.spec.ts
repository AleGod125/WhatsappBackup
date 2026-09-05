import es from '../../../assets/i18n/es.json';
import en from '../../../assets/i18n/en.json';
import pt from '../../../assets/i18n/pt.json';
import fr from '../../../assets/i18n/fr.json';
import de from '../../../assets/i18n/de.json';
// `it` a secas chocaria con el `it` de las pruebas.
import italiano from '../../../assets/i18n/it.json';
import { IDIOMAS, IDIOMA_POR_DEFECTO, idiomaDelNavegador } from './i18n.service';

/**
 * Los idiomas.
 *
 * Lo que más importa aquí no es que las traducciones sean bonitas: es que los
 * seis catálogos tengan LAS MISMAS claves. Una que falte se ve en pantalla
 * como texto en otro idioma, o peor, como la clave cruda — y eso se descubre
 * cuando lo ve un usuario, no cuando se escribe.
 */

const CATALOGOS: Record<string, unknown> = { es, en, pt, fr, de, it: italiano };

function claves(objeto: unknown, prefijo = ''): string[] {
  if (!objeto || typeof objeto !== 'object') return [prefijo];
  return Object.entries(objeto as Record<string, unknown>).flatMap(([clave, valor]) =>
    claves(valor, prefijo ? `${prefijo}.${clave}` : clave),
  );
}

describe('i18n: los catálogos', () => {
  it('los seis idiomas existen', () => {
    for (const idioma of IDIOMAS) expect(CATALOGOS[idioma]).toBeTruthy();
  });

  it('todos tienen exactamente las mismas claves', () => {
    const referencia = claves(es).sort();
    for (const idioma of IDIOMAS) {
      expect(claves(CATALOGOS[idioma]).sort()).toEqual(referencia);
    }
  });

  it('ningún texto está vacío', () => {
    for (const idioma of IDIOMAS) {
      const vacias = claves(CATALOGOS[idioma]).filter((ruta) => {
        let nodo: unknown = CATALOGOS[idioma];
        for (const parte of ruta.split('.')) nodo = (nodo as Record<string, unknown>)?.[parte];
        return typeof nodo !== 'string' || nodo.trim() === '';
      });
      expect(vacias).toEqual([]);
    }
  });

  it('los parámetros de una plantilla son los mismos en todos los idiomas', () => {
    // Si una traducción se come el `{{done}}`, la frase queda sin el número y
    // nadie se entera hasta que la ve un usuario de ese idioma.
    const parametros = (texto: string) => (texto.match(/\{\{(\w+)\}\}/g) ?? []).sort();
    for (const ruta of ['recovery.summary', 'recovery.available']) {
      const esperados = parametros(leer(es, ruta));
      for (const idioma of IDIOMAS) {
        expect(parametros(leer(CATALOGOS[idioma], ruta))).toEqual(esperados);
      }
    }
  });
});

describe('i18n: detección automática', () => {
  it('reconoce el idioma del navegador', () => {
    expect(idiomaDelNavegador(['es-419'])).toBe('es');
    expect(idiomaDelNavegador(['en-GB'])).toBe('en');
    expect(idiomaDelNavegador(['pt-BR'])).toBe('pt');
    expect(idiomaDelNavegador(['fr-CA'])).toBe('fr');
    expect(idiomaDelNavegador(['de-AT'])).toBe('de');
    expect(idiomaDelNavegador(['it-CH'])).toBe('it');
  });

  it('coge el primero que sepamos hablar', () => {
    expect(idiomaDelNavegador(['ja', 'ko', 'fr'])).toBe('fr');
  });

  it('un idioma que no tenemos cae al de por defecto, no al inglés por costumbre', () => {
    expect(idiomaDelNavegador(['ja-JP'])).toBe(IDIOMA_POR_DEFECTO);
    expect(idiomaDelNavegador([])).toBe(IDIOMA_POR_DEFECTO);
    expect(idiomaDelNavegador(undefined)).toBe(IDIOMA_POR_DEFECTO);
  });
});

function leer(catalogo: unknown, ruta: string): string {
  let nodo: unknown = catalogo;
  for (const parte of ruta.split('.')) nodo = (nodo as Record<string, unknown>)?.[parte];
  return typeof nodo === 'string' ? nodo : '';
}
