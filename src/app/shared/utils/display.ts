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
export function previewFor(type?: MessageType, text?: string): string {
  if (type === 'text') return text || '';
  return (
    (
      {
        image: '📷 Foto',
        video: '🎥 Video',
        audio: '🎤 Audio',
        sticker: 'Sticker',
        document: '📄 Documento',
        location: '📍 Ubicación',
        poll: '📊 Encuesta',
        missed_voice_call: '📞 Llamada perdida',
        missed_video_call: '📹 Videollamada',
      } as Partial<Record<MessageType, string>>
    )[type ?? 'unknown'] ??
    (text || 'Mensaje no compatible')
  );
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
