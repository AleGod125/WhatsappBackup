import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { ApiClientService } from '../api/api-client.service';
import { Media, Message, MessageCursor, MessageType, PagedMessages } from '../models/api.models';
import { extractArray, optionalNumber, optionalString } from './chat.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class MessageService {
  private readonly api = inject(ApiClientService);
  list(chatId: string, limit = 200, cursor?: MessageCursor) {
    return this.api
      .get<unknown>(`/chats/${encodeURIComponent(chatId)}/messages`, {
        limit,
        before_timestamp: cursor?.beforeTimestamp,
        before_id: cursor?.beforeId,
      })
      .pipe(map(normalizePage));
  }
}
export function normalizePage(value: unknown): PagedMessages {
  const root = (value ?? {}) as Record<string, unknown>;
  const items = extractArray(value, 'messages')
    .map(normalizeMessage)
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime() ||
        a.id.localeCompare(b.id),
    );
  const cursor = (root['next_cursor'] ?? root['cursor']) as Record<string, unknown> | undefined;
  const oldest = items[0];
  const beforeTimestamp =
    cursorValue(cursor?.['before_timestamp'] ?? cursor?.['beforeTimestamp']) ?? oldest?.timestamp;
  const beforeId = cursorValue(cursor?.['before_id'] ?? cursor?.['beforeId']) ?? oldest?.id;
  const hasMore = root['has_more'] ?? root['hasMore'];
  return {
    items,
    hasMore: typeof hasMore === 'boolean' ? hasMore : items.length >= 200,
    nextCursor: beforeTimestamp && beforeId ? { beforeTimestamp, beforeId } : undefined,
  };
}
export function normalizeMessage(value: unknown): Message {
  const r = (value ?? {}) as Record<string, unknown>;
  const media = r['media'] as Record<string, unknown> | undefined;
  const system =
    r['system_event'] && typeof r['system_event'] === 'object'
      ? (r['system_event'] as Record<string, unknown>)
      : undefined;
  return {
    id: String(r['id'] ?? r['message_id'] ?? ''),
    chatId: String(r['chat_id'] ?? r['chatId'] ?? ''),
    type: system
      ? systemType(system)
      : normalizeType(r['type'] ?? r['message_type'] ?? r['system_event']),
    text: optionalString(r['text'] ?? r['content'] ?? r['body'] ?? system?.['label']),
    timestamp: String(
      r['sent_at'] ?? r['created_at'] ?? r['timestamp'] ?? new Date(0).toISOString(),
    ),
    fromMe: r['from_me'] === true || r['fromMe'] === true || r['direction'] === 'outgoing',
    senderName: optionalString(r['sender_name']),
    media: media ? normalizeMedia(media) : undefined,
    reply:
      r['reply'] && typeof r['reply'] === 'object' ? (r['reply'] as Message['reply']) : undefined,
    latitude: optionalNumber(r['latitude']),
    longitude: optionalNumber(r['longitude']),
    pollQuestion: optionalString(r['poll_question']),
    pollOptions: Array.isArray(r['poll_options']) ? r['poll_options'].map(String) : undefined,
  };
}
export function normalizeMedia(r: Record<string, unknown>): Media {
  const rawStatus = String(r['status'] ?? 'pending').toLowerCase();
  const status = rawStatus === 'error' ? 'failed' : rawStatus;
  return {
    id: String(r['id'] ?? r['media_id'] ?? ''),
    status: ([
      'pending',
      'downloading',
      'downloaded',
      'failed',
      'unavailable',
      'expired',
      'missing',
    ].includes(status)
      ? status
      : 'pending') as Media['status'],
    mimeType: optionalString(r['mime_type']),
    filename: optionalString(r['file_name'] ?? r['filename']),
    size: optionalNumber(r['file_size'] ?? r['size']),
    duration: optionalNumber(r['duration_seconds'] ?? r['duration']),
    thumbnailUrl: apiUrl(optionalString(r['thumbnail_url'])),
    fileUrl: apiUrl(optionalString(r['file_url'])),
    width: optionalNumber(r['width']),
    height: optionalNumber(r['height']),
  };
}
const known = new Set<MessageType>([
  'text',
  'image',
  'video',
  'audio',
  'voice_note',
  'document',
  'sticker',
  'location',
  'poll',
  'missed_voice_call',
  'missed_video_call',
  'voice_call',
  'video_call',
  'encryption_notice',
  'system',
  'unknown_system',
  'unknown',
]);
const normalizeType = (value: unknown): MessageType => {
  const type = String(value ?? 'unknown').toLowerCase() as MessageType;
  return known.has(type) ? type : 'unknown';
};
const systemType = (event: Record<string, unknown>): MessageType => {
  const kind = String(event['kind'] ?? 'unknown').toLowerCase();
  const mapping: Record<string, MessageType> = {
    missed_voice_call: 'missed_voice_call',
    missed_call: 'missed_voice_call',
    missed_video_call: 'missed_video_call',
    voice_call: 'voice_call',
    video_call: 'video_call',
    encryption: 'encryption_notice',
    unknown: 'unknown_system',
  };
  return mapping[kind] ?? 'system';
};
const cursorValue = (value: unknown): string | number | undefined =>
  typeof value === 'string' || typeof value === 'number' ? value : undefined;
const apiUrl = (value?: string): string | undefined =>
  value ? new URL(value, environment.apiBaseUrl).href : undefined;
