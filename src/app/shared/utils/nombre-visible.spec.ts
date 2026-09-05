import { Chat } from '../../core/models/api.models';
import { esperandoMetadata, nombreVisible, textoBuscable } from './nombre-visible';

/**
 * El nombre que se enseña de una conversación.
 *
 * EL PROBLEMA MEDIDO
 * ------------------
 * `chats.name` estaba a `NULL` en las 51 conversaciones de la sesión real: el
 * nombre vive en la agenda y llega después. Mientras tanto la pantalla decía
 * «Contacto sin nombre» como si fuera definitivo, y el usuario daba por
 * perdido algo que iba a aparecer en veinte segundos.
 *
 * Y una regla que no se rompe: el alias del usuario **no sobrescribe nada**.
 * Se aplica al mostrar, así que volver al original es quitarlo.
 */

const t = (clave: string) => clave;

const chat = (extra: Partial<Chat> = {}): Chat =>
  ({ id: '1', jid: '573001112233@s.whatsapp.net', displayName: 'Ana', ...extra }) as Chat;

describe('Nombre visible: la prioridad', () => {
  it('el alias del usuario manda sobre todo lo demás', () => {
    const salida = nombreVisible(chat({ displayName: 'Ana' }), 'Primo Juan', t);
    expect(salida.texto).toBe('Primo Juan');
    expect(salida.esAlias).toBe(true);
  });

  it('sin alias se usa el nombre que resolvió el backend', () => {
    expect(nombreVisible(chat(), undefined, t).texto).toBe('Ana');
  });

  it('un alias en blanco no cuenta como alias', () => {
    // «Vacío» significa volver al original, no llamar al chat «   ».
    expect(nombreVisible(chat(), '   ', t).texto).toBe('Ana');
  });

  it('el alias se recorta', () => {
    expect(nombreVisible(chat(), '  Tía Nore  ', t).texto).toBe('Tía Nore');
  });
});

describe('Nombre visible: mientras llega la metadata', () => {
  it('sin nombre todavía, se dice que está cargando', () => {
    const salida = nombreVisible(chat({ displayName: '' }), undefined, t);
    expect(salida.texto).toBe('chat.loadingContact');
    expect(salida.provisional).toBe(true);
  });

  it('un grupo dice que carga un grupo', () => {
    const salida = nombreVisible(
      chat({ displayName: '', jid: '1203@g.us', type: 'group' }),
      undefined,
      t,
    );
    expect(salida.texto).toBe('chat.loadingGroup');
  });

  it('un nombre que es el propio identificador NO es un nombre', () => {
    // El backend usa el JID cuando no tiene otra cosa. Enseñarlo como nombre
    // es enseñar un número de teléfono y llamarlo persona.
    const salida = nombreVisible(
      chat({ displayName: '573001112233@s.whatsapp.net' }),
      undefined,
      t,
    );
    expect(salida.provisional).toBe(true);
  });

  it('un alias gana incluso mientras se espera la metadata', () => {
    const salida = nombreVisible(chat({ displayName: '' }), 'Primo Juan', t);
    expect(salida.texto).toBe('Primo Juan');
    expect(salida.provisional).toBe(false);
  });

  it('con nombre de verdad ya no se espera nada', () => {
    expect(esperandoMetadata(chat({ displayName: 'Ana' }))).toBe(false);
  });
});

describe('Nombre visible: la búsqueda', () => {
  it('encuentra por el alias', () => {
    // Si alguien renombró un chat a «Primo Juan», buscar «primo» tiene que
    // encontrarlo: es el nombre por el que lo conoce.
    expect(textoBuscable(chat(), 'Primo Juan')).toContain('primo juan');
  });

  it('sigue encontrando por el nombre original', () => {
    expect(textoBuscable(chat({ displayName: 'Ana' }), 'Primo Juan')).toContain('ana');
  });

  it('y por la previa del último mensaje', () => {
    expect(textoBuscable(chat({ preview: 'nos vemos mañana' }), undefined)).toContain('mañana');
  });
});
