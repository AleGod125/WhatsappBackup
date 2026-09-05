import { avatarHue, initials, previewFor, safeHttpUrl } from './display';
describe('display helpers', () => {
  it('creates initials', () => expect(initials('VirtualTec Marco')).toBe('VM'));
  it('uses deterministic colors', () => expect(avatarHue('chat-1')).toBe(avatarHue('chat-1')));
  it('renders media preview', () => expect(previewFor('image')).toBe('📷 Foto'));
  it('labels unknown safely', () =>
    expect(previewFor('unknown')).toBe('Mensaje no compatible'));
  it('rejects unsafe URLs', () => expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined());
});

/**
 * Los tipos que de verdad hay en la base y salian como "Mensaje no compatible".
 *
 * Medido: system 112, unknown 16, contact 3. Los tres tenian etiqueta buena en
 * el backend y el frontend la tiraba para recalcularla con un mapa incompleto.
 */
describe('Etiquetas de los tipos que faltaban', () => {
  it('un contacto ya no es "no compatible"', () => {
    expect(previewFor('contact')).toBe('👤 Contacto');
  });

  it('un evento del chat ya no es "no compatible"', () => {
    expect(previewFor('system')).toBe('Evento del chat');
  });

  it('lo que no se entiende se dice como es', () => {
    // "No se pudo interpretar" y "no es compatible" no son lo mismo: el
    // mensaje llego, lo que no se supo es su tipo.
    expect(previewFor('unknown')).toBe('Mensaje no compatible');
  });

  it('sticker, ubicacion y encuesta siguen teniendo la suya', () => {
    expect(previewFor('sticker')).toBe('Sticker');
    expect(previewFor('location')).toBe('📍 Ubicación');
    expect(previewFor('poll')).toBe('📊 Encuesta');
  });

  it('el texto manda cuando lo hay', () => {
    expect(previewFor('text', 'hola')).toBe('hola');
  });

  it('"Mensaje no compatible" solo queda sin tipo y sin texto', () => {
    expect(previewFor(undefined, undefined)).toBe('Mensaje no compatible');
  });
});
