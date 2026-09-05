import { Chat } from '../../core/models/api.models';

/**
 * Qué nombre se enseña de una conversación. Un solo sitio lo decide.
 *
 * LA PRIORIDAD, Y POR QUE ES ESA
 * ------------------------------
 *   1. el alias que puso el usuario
 *   2. el nombre que ya venía resuelto del backend
 *   3. un texto de espera, o uno definitivo
 *
 * El alias va primero porque es la única fuente que sabe cómo llama el usuario
 * a esa persona. WhatsApp puede no traer nombre nunca —se midió: `chats.name`
 * estaba a `NULL` en las 51 conversaciones, y el nombre real vivía en la
 * agenda— y aun así el usuario reconoce el chat.
 *
 * LO QUE NO SE TOCA
 * -----------------
 * El alias **no** sobrescribe nada: ni el JID, ni `contacts.display_name`, ni
 * los metadatos de WhatsApp. Se guarda aparte y se aplica al mostrar, así que
 * volver al nombre original es quitar el alias, no recuperar algo perdido.
 */

/**
 * `true` si el backend todavía puede traer un nombre para esta conversación.
 *
 * Importa para no mentir: mientras la metadata sigue llegando, «Contacto sin
 * nombre» es falso —todavía no se sabe— y decirlo como definitivo hace que el
 * usuario dé por perdido algo que va a aparecer en veinte segundos.
 */
export function esperandoMetadata(chat: Pick<Chat, 'displayName' | 'jid'>): boolean {
  const nombre = (chat.displayName ?? '').trim();
  if (!nombre) return true;
  // El backend usa el identificador como nombre cuando no tiene otra cosa. Un
  // nombre que es el propio JID no es un nombre.
  return nombre === chat.jid || nombre === chat.jid?.split('@')[0];
}

export interface NombreVisible {
  /** Lo que se pinta. */
  texto: string;
  /** Si viene de un alias del usuario, para poder ofrecer «usar el original». */
  esAlias: boolean;
  /** Si todavía se está esperando la metadata: el texto es provisional. */
  provisional: boolean;
}

/**
 * @param chat la conversación
 * @param alias el alias del usuario, si le puso uno
 * @param t la función de traducción (los textos de espera son de interfaz)
 */
export function nombreVisible(
  chat: Pick<Chat, 'displayName' | 'jid' | 'type'>,
  alias: string | undefined,
  t: (clave: string) => string,
): NombreVisible {
  const limpio = (alias ?? '').trim();
  if (limpio) return { texto: limpio, esAlias: true, provisional: false };

  if (!esperandoMetadata(chat)) {
    return { texto: chat.displayName, esAlias: false, provisional: false };
  }

  const esGrupo = chat.type === 'group' || chat.jid?.endsWith('@g.us');
  return {
    texto: t(esGrupo ? 'chat.loadingGroup' : 'chat.loadingContact'),
    esAlias: false,
    provisional: true,
  };
}

/**
 * El texto sobre el que busca el usuario.
 *
 * Incluye el alias: si alguien renombró un chat a «Primo Juan», buscar «primo»
 * tiene que encontrarlo — es el nombre por el que lo conoce. Y se conserva el
 * nombre original, porque también puede buscar por él.
 */
export function textoBuscable(
  chat: Pick<Chat, 'displayName' | 'preview'>,
  alias: string | undefined,
): string {
  return [alias ?? '', chat.displayName ?? '', chat.preview ?? ''].join(' ').toLocaleLowerCase();
}
