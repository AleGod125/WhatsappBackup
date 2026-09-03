export type SessionStateCode =
  | 'STARTING'
  | 'NO_SESSION'
  | 'PAIRING_REQUIRED'
  | 'PAIRING'
  | 'QR_READY'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'SESSION_INVALID'
  | 'ERROR';
export interface SessionState {
  state: SessionStateCode;
  connected: boolean;
  viewerAllowed?: boolean;
  whatsappEnabled?: boolean;
  generation?: number;
  message?: string;
  qrAvailable?: boolean;
}
export interface QrStatus {
  available: boolean;
  imageUrl?: string;
  generation?: number;
  expiresAt?: string;
  expiresInSeconds?: number;
}
export interface HealthStatus {
  status: string;
  state?: SessionStateCode;
  database: boolean;
  whatsappEnabled: boolean;
  sessionFilePresent?: boolean;
  apiVersion?: string;
}
export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice_note'
  | 'document'
  | 'sticker'
  | 'location'
  | 'poll'
  | 'missed_voice_call'
  | 'missed_video_call'
  | 'voice_call'
  | 'video_call'
  | 'encryption_notice'
  | 'system'
  | 'unknown_system'
  | 'unknown';
export interface ChatAvatar {
  initials: string;
  color: string;
  url?: string;
}
export type ChatHistoryStatus =
  'waiting_seed' | 'pending' | 'fetching' | 'timeout' | 'complete' | 'exhausted';
export interface Chat {
  id: string;
  jid?: string;
  displayName: string;
  avatar?: ChatAvatar;
  avatarUrl?: string;
  preview?: string;
  lastMessageAt?: string;
  lastMessageTimestamp?: number;
  messageCount?: number;
  historyStatus?: ChatHistoryStatus;
  waitingSeed?: boolean;
  historyComplete?: boolean;
  type?: string;
  unreadCount?: number;
  favorite?: boolean;
  firstMessageAt?: string;
}
export interface ChatDetails extends Chat {
  stats?: {
    total: number;
    oldestTimestamp?: number;
    newestTimestamp?: number;
    oldestAt?: string;
    newestAt?: string;
  };
}
export type MediaStatus =
  'pending' | 'downloading' | 'downloaded' | 'failed' | 'unavailable' | 'expired' | 'missing';
export interface Media {
  id: string;
  status: MediaStatus;
  mimeType?: string;
  filename?: string;
  size?: number;
  duration?: number;
  thumbnailUrl?: string;
  fileUrl?: string;
  width?: number;
  height?: number;
}
export interface MessageReply {
  senderName?: string;
  text?: string;
  messageId?: string;
}
export interface Message {
  id: string;
  chatId: string;
  type: MessageType;
  text?: string;
  timestamp: string;
  fromMe: boolean;
  senderName?: string;
  media?: Media;
  reply?: MessageReply;
  latitude?: number;
  longitude?: number;
  pollQuestion?: string;
  pollOptions?: string[];
}
export interface MessageCursor {
  beforeTimestamp: string | number;
  beforeId: string | number;
}
export interface PagedMessages {
  items: Message[];
  hasMore: boolean;
  nextCursor?: MessageCursor;
}
export interface SyncStatus {
  connected?: boolean;
  state?: 'idle' | 'running' | 'complete' | 'error';
  history?: 'idle' | 'syncing' | 'complete' | 'error';
  mediaPending?: number;
  backfillCurrent?: number;
  backfillTotal?: number;
  messagesNew?: number;
  synced?: number;
  waitingSeed?: number;
  timeouts?: number;
  errors?: number;
  pending?: number;
}
export type WebBootstrapState =
  | 'inactive'
  | 'starting'
  | 'qr_required'
  | 'connecting'
  | 'searching_chat'
  | 'seed_found'
  | 'seed_validated'
  | 'seed_emitted'
  | 'backfill_pending'
  | 'completed'
  | 'failed';
export interface WebBootstrapJob {
  jobId: string;
  chatId: number;
  state: WebBootstrapState;
  qrAvailable: boolean;
  candidateEmitted?: boolean;
  backfillEnqueued?: boolean;
  transportAvailable?: boolean;
  error?: string;
  elapsedSeconds?: number;
}
export interface ApiErrorBody {
  error: { code: string; message: string };
}
export interface AppError {
  code: string;
  message: string;
  status?: number;
  offline?: boolean;
}
export interface RealtimeEnvelope<T = unknown> {
  type: string;
  data: T;
}
export interface RealtimeEvent<T = unknown> extends RealtimeEnvelope<T> {}
export interface SystemEvent {
  type:
    | 'missed_voice_call'
    | 'missed_video_call'
    | 'voice_call'
    | 'video_call'
    | 'encryption_notice'
    | 'system'
    | 'unknown_system';
  text?: string;
}
