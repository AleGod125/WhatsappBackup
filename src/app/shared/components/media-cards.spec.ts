import { clasificar, dominioDe, enlacesDe } from './link-card.component';
import { extensionDe, familiaDe } from './document-card.component';

/**
 * Enlaces y documentos.
 *
 * Antes se veían como texto azul crudo y como un emoji con el nombre del
 * archivo. Lo que se protege aquí es sobre todo lo que NO se hace: no se
 * inventa un enlace donde el remitente escribió texto, y no se pide nada a
 * ningún servidor de terceros para pintar una tarjeta.
 */

describe('Enlaces: cuáles se detectan', () => {
  it('encuentra los enlaces de un texto', () => {
    expect(enlacesDe('mira esto https://youtube.com/watch?v=1 y esto https://github.com/x')).toEqual(
      ['https://youtube.com/watch?v=1', 'https://github.com/x'],
    );
  });

  it('no repite el mismo enlace dos veces', () => {
    expect(enlacesDe('https://x.com https://x.com')).toEqual(['https://x.com']);
  });

  it('quita la puntuación pegada al final', () => {
    expect(enlacesDe('entra en https://ejemplo.com.')).toEqual(['https://ejemplo.com']);
  });

  it('NO convierte en enlace algo que se escribió como texto', () => {
    // Detectar «www.algo.com» sin esquema obliga a adivinar, y adivinar aquí
    // significa convertir en enlace lo que la persona escribió como texto.
    expect(enlacesDe('escríbeme a www.ejemplo.com')).toEqual([]);
    expect(enlacesDe('hola qué tal')).toEqual([]);
  });

  it('un texto vacío no da nada', () => {
    expect(enlacesDe(undefined)).toEqual([]);
    expect(enlacesDe('')).toEqual([]);
  });
});

describe('Enlaces: qué sitio es', () => {
  it('saca el dominio sin el www', () => {
    expect(dominioDe('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
  });

  it('una URL que el navegador no sabe leer no rompe nada', () => {
    expect(dominioDe('no es una url')).toBeTruthy();
  });

  it('reconoce los sitios habituales', () => {
    expect(clasificar('youtube.com')).toBe('youtube');
    expect(clasificar('youtu.be')).toBe('youtube');
    expect(clasificar('tiktok.com')).toBe('tiktok');
    expect(clasificar('facebook.com')).toBe('facebook');
    expect(clasificar('instagram.com')).toBe('instagram');
    expect(clasificar('x.com')).toBe('x');
    expect(clasificar('twitter.com')).toBe('x');
    expect(clasificar('github.com')).toBe('github');
  });

  it('lo que no reconoce sigue siendo un enlace válido', () => {
    expect(clasificar('unperiodico.es')).toBe('otro');
  });
});

describe('Documentos: extensión y familia', () => {
  it('saca la extensión', () => {
    expect(extensionDe('informe.PDF')).toBe('pdf');
    expect(extensionDe('hoja de cálculo.xlsx')).toBe('xlsx');
  });

  it('un archivo oculto no tiene extensión', () => {
    // Un punto al principio no es una extensión.
    expect(extensionDe('.gitignore')).toBe('');
  });

  it('sin punto tampoco', () => {
    expect(extensionDe('README')).toBe('');
    expect(extensionDe('acaba en punto.')).toBe('');
  });

  it('agrupa por familia', () => {
    expect(familiaDe('pdf')).toBe('pdf');
    expect(familiaDe('docx')).toBe('texto');
    expect(familiaDe('csv')).toBe('hoja');
    expect(familiaDe('pptx')).toBe('diapositivas');
    expect(familiaDe('rar')).toBe('comprimido');
    expect(familiaDe('xyz')).toBe('otro');
  });
});
