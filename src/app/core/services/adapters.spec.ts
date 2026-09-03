import { normalizeHealth, normalizeSession } from './session.service';
import { normalizeChat, normalizeChatDetails } from './chat.service';
import { normalizeMessage, normalizePage } from './message.service';
import { normalizeSyncStatus } from './sync.service';
describe('API adapters', () => {
  it('recognizes connected', () =>
    expect(normalizeSession({ state: 'CONNECTED' }).connected).toBe(true));
  it('recognizes nested pairing', () =>
    expect(normalizeSession({ session: { status: 'PAIRING' } }).state).toBe('PAIRING'));
  it('defaults session safely', () => expect(normalizeSession({}).state).toBe('NO_SESSION'));
  it('normalizes chat', () =>
    expect(normalizeChat({ chat_id: 'a', display_name: 'Ana' })).toEqual(
      expect.objectContaining({ id: 'a', displayName: 'Ana' }),
    ));
  it('normalizes downloaded image', () =>
    expect(
      normalizeMessage({ id: '1', type: 'image', media: { id: 'm', status: 'downloaded' } }).media
        ?.status,
    ).toBe('downloaded'));
  it('normalizes unavailable image', () =>
    expect(
      normalizeMessage({ id: '1', type: 'image', media: { id: 'm', status: 'unavailable' } }).media
        ?.status,
    ).toBe('unavailable'));
  it('normalizes missed call', () =>
    expect(normalizeMessage({ id: '1', system_event: 'missed_voice_call' }).type).toBe(
      'missed_voice_call',
    ));
  it('keeps media types', () =>
    expect(
      ['video', 'audio', 'document'].map((type) => normalizeMessage({ id: type, type }).type),
    ).toEqual(['video', 'audio', 'document']));
  it('sorts page chronologically', () =>
    expect(
      normalizePage({
        messages: [
          { id: '2', timestamp: '2026-01-02' },
          { id: '1', timestamp: '2026-01-01' },
        ],
      }).items.map((m) => m.id),
    ).toEqual(['1', '2']));
  it('builds keyset cursor', () =>
    expect(
      normalizePage({ messages: [{ id: 'first', timestamp: '2026-01-01' }] }).nextCursor,
    ).toEqual({ beforeTimestamp: '2026-01-01', beforeId: 'first' }));
  it('keeps the numeric cursor returned by backend', () =>
    expect(
      normalizePage({ messages: [], next_cursor: { before_timestamp: 1787, before_id: 1289 } })
        .nextCursor,
    ).toEqual({ beforeTimestamp: 1787, beforeId: 1289 }));
  it('uses sent_at for rendering dates', () =>
    expect(
      normalizeMessage({ id: 1, timestamp: 1787, sent_at: '2026-08-21T08:38:02-05:00' }).timestamp,
    ).toBe('2026-08-21T08:38:02-05:00'));
  it('maps real media field names and absolute URLs', () => {
    const media = normalizeMessage({
      id: 1,
      type: 'audio',
      media: {
        id: 562,
        status: 'downloaded',
        file_name: 'voice.ogg',
        file_size: 42,
        duration_seconds: 9,
        file_url: '/api/v1/media/562/file',
      },
    }).media;
    expect(media).toEqual(
      expect.objectContaining({
        filename: 'voice.ogg',
        size: 42,
        duration: 9,
        fileUrl: 'http://127.0.0.1:5000/api/v1/media/562/file',
      }),
    );
  });
  it('maps encryption system events', () =>
    expect(
      normalizeMessage({
        id: 1,
        type: 'system',
        system_event: { kind: 'encryption', label: 'Cifrado' },
      }),
    ).toEqual(expect.objectContaining({ type: 'encryption_notice', text: 'Cifrado' })));
  it('maps unknown system events discretely', () =>
    expect(
      normalizeMessage({
        id: 1,
        type: 'system',
        system_event: { kind: 'unknown', label: 'Evento del sistema' },
      }).type,
    ).toBe('unknown_system'));
  it('maps real chat details stats', () =>
    expect(
      normalizeChatDetails({
        id: 205,
        display_name: 'Marco',
        stats: { total: 452, oldest_at: '2026-08-10' },
      }),
    ).toEqual(
      expect.objectContaining({
        messageCount: undefined,
        firstMessageAt: '2026-08-10',
        stats: expect.objectContaining({ total: 452 }),
      }),
    ));
  it('maps local health mode', () =>
    expect(normalizeHealth({ status: 'ok', database: true, whatsapp_enabled: false })).toEqual(
      expect.objectContaining({ database: true, whatsappEnabled: false }),
    ));
  it('maps nested sync media pending', () =>
    expect(normalizeSyncStatus({ history_done: true, media: { pending: 3 } })).toEqual(
      expect.objectContaining({ history: 'complete', mediaPending: 3 }),
    ));
  it('preserves waiting_seed chat state', () =>
    expect(
      normalizeChat({
        id: 9,
        display_name: 'Isaac Virtual Tec',
        history_status: 'waiting_seed',
        waiting_seed: true,
        history_complete: false,
      }),
    ).toEqual(
      expect.objectContaining({
        historyStatus: 'waiting_seed',
        waitingSeed: true,
        historyComplete: false,
      }),
    ));
  it('preserves the synchronization recovery breakdown', () =>
    expect(
      normalizeSyncStatus({ synced: 7, waiting_seed: 30, timeouts: 2, errors: 0, pending: 1 }),
    ).toEqual(
      expect.objectContaining({ synced: 7, waitingSeed: 30, timeouts: 2, errors: 0, pending: 1 }),
    ));
  it('uses the current chat breakdown from the real sync/status shape', () =>
    expect(
      normalizeSyncStatus({
        result: { synced: 0, waiting_seed: 0, timeouts: 0, errors: 0, pending: 0 },
        chats: {
          chats_complete: 7,
          chats_waiting_seed: 29,
          chats_pending: 2,
          por_estado: { timeout: 2 },
        },
      }),
    ).toEqual(expect.objectContaining({ synced: 7, waitingSeed: 29, timeouts: 2, pending: 2 })));
});
