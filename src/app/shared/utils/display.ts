import { MessageType } from '../../core/models/api.models';
export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}
export function avatarHue(seed: string): number {
  let hash = 0;
  for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}
/**
 * Etiqueta corta de un mensaje, de ÚLTIMO recurso.
 *
 * La buena la calcula el backend y viaja en `message.preview`: allí se conoce
 * el protobuf entero —el `stub_type` de un evento de sistema, los subtipos de
 * encuesta— y aquí sólo llega el tipo normalizado. Esta función se usa cuando
 * el backend no mandó etiqueta, no en lugar de ella.
 *
 * Mantenerla como mapa principal fue el bug: le faltaban `system` (112
 * mensajes medidos), `contact` y `unknown`, y los tres caían en
 * "Mensaje no compatible" cuando el backend ya sabía decir qué eran.
 */
export function previewFor(type?: MessageType, text?: string): string {
  if (type === 'text') return text || '';
  const etiqueta = (
    {
      image: '📷 Foto',
      video: '🎥 Video',
      gif: '🎥 GIF',
      audio: '🎤 Audio',
      voice_note: '🎤 Nota de voz',
      sticker: 'Sticker',
      document: '📄 Documento',
      location: '📍 Ubicación',
      contact: '👤 Contacto',
      poll: '📊 Encuesta',
      reaction: 'Reacción',
      call: '📞 Llamada',
      missed_voice_call: '📞 Llamada perdida',
      missed_video_call: '📹 Videollamada',
      system: 'Evento del chat',
      // No es lo mismo "no lo entiendo" que "no se puede mostrar": el
      // mensaje existe y llegó, sólo que su tipo no se supo interpretar.
      unknown: 'Mensaje no compatible',
    } as Partial<Record<MessageType, string>>
  )[type ?? 'unknown'];
  if (etiqueta) return etiqueta;
  if (text) return text;
  // Un tipo que no está en el mapa. Se deja constancia para poder añadirlo,
  // en vez de que desaparezca detrás de una etiqueta genérica.
  if (type) console.debug('unknown_message_type=%s', type);
  return 'Mensaje no compatible';
}
export function safeHttpUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
