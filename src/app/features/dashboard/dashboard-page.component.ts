import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AppError,
  Chat,
  Media,
  Message,
  SyncStatus,
  WebBootstrapState,
} from '../../core/models/api.models';
import { ChatService, normalizeChat } from '../../core/services/chat.service';
import { normalizeMedia, normalizeMessage } from '../../core/services/message.service';
import { RealtimeService } from '../../core/events/realtime.service';
import { SyncService, normalizeSyncStatus } from '../../core/services/sync.service';
import { LeftRailComponent } from './left-rail.component';
import { ChatSidebarComponent } from './chat-sidebar/chat-sidebar.component';
import { ConversationComponent } from './conversation/conversation.component';
import { SyncIndicatorComponent } from './sync-status/sync-indicator.component';
import { SessionService } from '../../core/services/session.service';
import { previewFor } from '../../shared/utils/display';
import { WebBootstrapService } from '../../core/services/web-bootstrap.service';
import { HistoryRecoveryPanelComponent } from './recovery/history-recovery-panel.component';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    LeftRailComponent,
    ChatSidebarComponent,
    ConversationComponent,
    SyncIndicatorComponent,
    HistoryRecoveryPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent implements OnInit {
  private readonly chatsApi = inject(ChatService);
  private readonly syncApi = inject(SyncService);
  private readonly sessionApi = inject(SessionService);
  private readonly recoveryApi = inject(WebBootstrapService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private syncPollTimer?: ReturnType<typeof setTimeout>;
  private readonly conversation = viewChild(ConversationComponent);
  readonly chats = signal<Chat[]>([]);
  readonly selected = signal<Chat | undefined>(undefined);
  readonly loading = signal(true);
  readonly sync = signal<SyncStatus | undefined>(undefined);
  readonly disconnected = signal(false);
  readonly reconnecting = signal(false);
  readonly localMode = signal(false);
  readonly syncBusy = signal(false);
  readonly toast = signal<string | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);
  readonly globalRecoveryOpen = signal(false);
  readonly globalRecoveryState = signal<WebBootstrapState>('starting');
  readonly globalRecoveryError = signal<string | undefined>(undefined);
  readonly globalRecoveryQrRequired = signal(false);
  readonly syncRunning = computed(() => this.syncBusy() || isSyncRunning(this.sync()));
  readonly syncDisabled = computed(
    () => this.localMode() || this.disconnected() || this.syncRunning(),
  );
  readonly syncTooltip = computed(() =>
    this.localMode()
      ? 'El backend está en modo local.'
      : this.disconnected()
        ? 'WhatsApp no está conectado.'
        : this.syncRunning()
          ? 'Sincronizando...'
          : 'Sincronizar ahora',
  );
  ngOnInit() {
    this.destroyRef.onDestroy(() => {
      if (this.syncPollTimer) clearTimeout(this.syncPollTimer);
    });
    this.loadRuntimeMode();
    this.loadChats();
    this.loadSync();
    this.realtime.connect();
    this.realtime.connection$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((state) => {
      if (state === 'disconnected') {
        this.disconnected.set(true);
        this.reconnecting.set(true);
      } else {
        const mustReconcile = this.reconnecting();
        this.disconnected.set(false);
        this.reconnecting.set(false);
        if (mustReconcile) this.reconcileAfterReconnect();
      }
    });
    this.realtime.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.handleEvent(event.type, event.data));
  }
  runSync() {
    if (this.syncDisabled()) return;
    this.syncBusy.set(true);
    this.sync.update((value) => ({ ...value, state: 'running' }));
    this.syncApi
      .run()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          const status = normalizeSyncStatus(value);
          this.sync.set({ ...status, state: status.state ?? 'running' });
          this.syncBusy.set(true);
          this.scheduleSyncPoll();
        },
        error: (error: AppError) => {
          this.syncBusy.set(false);
          if (error.code === 'SYNC_ALREADY_RUNNING') {
            this.sync.update((value) => ({ ...value, state: 'running' }));
            return;
          }
          if (error.code === 'WHATSAPP_DISABLED') this.showToast('El backend está en modo local.');
          else if (error.code === 'SESSION_NOT_CONNECTED')
            this.showToast('WhatsApp no está conectado.');
          else this.showToast(error.message);
        },
      });
  }
  recoverPendingHistories() {
    this.globalRecoveryOpen.set(true);
    this.globalRecoveryState.set('starting');
    this.globalRecoveryError.set(undefined);
    this.globalRecoveryQrRequired.set(false);
    this.recoveryApi
      .recoverPending()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.globalRecoveryState.set(result.state);
          this.globalRecoveryQrRequired.set(result.qrRequired);
          this.globalRecoveryError.set(result.message);
        },
        error: (error: AppError) => {
          this.globalRecoveryState.set('failed');
          this.globalRecoveryError.set(error.message);
        },
      });
  }
  recoveryCompleted() {
    this.loadSync();
    this.loadChats();
  }
  select(chat: Chat) {
    this.selected.set(chat);
    this.router.navigate(['/dashboard', chat.id]);
    this.chatsApi
      .get(chat.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          if (this.selected()?.id === chat.id) this.selected.set(mergeDefined(chat, detail));
        },
      });
  }
  private loadChats() {
    this.loading.set(true);
    this.chatsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (chats) => {
          this.chats.set(chats);
          this.loading.set(false);
          const id =
            this.route.snapshot.paramMap.get('chatId') ??
            this.route.snapshot.queryParamMap.get('chat');
          if (id) {
            const chat = chats.find((item) => item.id === id);
            if (chat) this.select(chat);
          }
        },
        error: () => {
          this.error.set('No fue posible cargar las conversaciones.');
          this.loading.set(false);
        },
      });
  }
  private reconcileAfterReconnect() {
    const selectedId = this.selected()?.id;
    this.chatsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (chats) => {
          this.chats.set(chats);
          if (!selectedId) return;
          this.chatsApi
            .get(selectedId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (detail) => {
                if (this.selected()?.id === selectedId) {
                  this.selected.update((current) => mergeDefined(current, detail));
                  this.conversation()?.reload();
                }
              },
            });
        },
      });
  }
  private loadSync() {
    this.syncApi
      .status()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          const previous = this.sync();
          this.sync.set(value);
          this.syncBusy.set(isSyncRunning(value));
          if (value.connected === false) this.disconnected.set(true);
          if (isSyncRunning(value)) this.scheduleSyncPoll();
          else if (isSyncRunning(previous) && isSyncComplete(value))
            this.showToast(
              value.messagesNew && value.messagesNew > 0
                ? `${value.messagesNew} mensajes nuevos sincronizados`
                : 'Sincronización completada',
            );
        },
      });
  }
  private scheduleSyncPoll() {
    if (this.syncPollTimer) clearTimeout(this.syncPollTimer);
    this.syncPollTimer = setTimeout(() => {
      this.syncPollTimer = undefined;
      this.loadSync();
    }, 1200);
  }
  private loadRuntimeMode() {
    this.sessionApi
      .health()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (health) => {
          this.localMode.set(!health.whatsappEnabled);
          this.sessionApi
            .getSession()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: (session) => this.disconnected.set(!session.connected) });
        },
      });
  }
  private handleEvent(type: string, data: unknown) {
    if (type === 'session.state' && data && typeof data === 'object') {
      const raw = data as Record<string, unknown>;
      const state = String(raw['state'] ?? raw['status'] ?? '').toUpperCase();
      if (state === 'SESSION_INVALID') this.router.navigate(['/pairing']);
      if (state === 'CONNECTED') this.disconnected.set(false);
      else if (state !== 'CONNECTING') this.disconnected.set(true);
    }
    if (type === 'sync.status' && data && typeof data === 'object') {
      const previous = this.sync();
      const current = normalizeSyncStatus(unwrap(data, 'sync'));
      this.sync.set(current);
      this.syncBusy.set(false);
      if (current.connected === false) this.disconnected.set(true);
      if (isSyncRunning(previous) && isSyncComplete(current))
        this.showToast(
          current.messagesNew && current.messagesNew > 0
            ? `${current.messagesNew} mensajes nuevos sincronizados`
            : 'Sincronización completada',
        );
    }
    if (type === 'chat.updated') {
      const chat = normalizeChat(unwrap(data, 'chat'));
      this.upsertChat(chat);
    }
    if (type === 'message.created') {
      const message = normalizeMessage(unwrap(data, 'message'));
      this.conversation()?.append(message);
      const current = this.chats().find((c) => c.id === message.chatId);
      if (current)
        this.upsertChat({
          ...current,
          preview: previewFor(message.type, message.text),
          lastMessageAt: message.timestamp,
        });
    }
    if (type === 'message.updated')
      this.conversation()?.update(normalizeMessage(unwrap(data, 'message')));
    if (type === 'media.updated' && data && typeof data === 'object') {
      const raw = data as Record<string, unknown>;
      const mediaRaw = (
        raw['media'] && typeof raw['media'] === 'object' ? raw['media'] : raw
      ) as Record<string, unknown>;
      const messageId = String(
        raw['message_id'] ??
          raw['messageId'] ??
          mediaRaw['message_id'] ??
          mediaRaw['messageId'] ??
          '',
      );
      this.conversation()?.updateMedia(messageId, normalizeMedia(mediaRaw));
    }
  }
  private upsertChat(chat: Chat) {
    this.chats.update((items) => {
      const previous = items.find((item) => item.id === chat.id);
      const merged = mergeDefined(previous, chat);
      return [merged, ...items.filter((item) => item.id !== chat.id)].sort(
        (a, b) =>
          (b.lastMessageTimestamp ?? Date.parse(b.lastMessageAt ?? '') ?? 0) -
          (a.lastMessageTimestamp ?? Date.parse(a.lastMessageAt ?? '') ?? 0),
      );
    });
    if (this.selected()?.id === chat.id) this.selected.update((value) => mergeDefined(value, chat));
  }
  private showToast(message: string) {
    this.toast.set(message);
    setTimeout(() => this.toast.set(undefined), 3500);
  }
}
function isSyncRunning(value?: SyncStatus) {
  return value?.state !== undefined ? value.state === 'running' : value?.history === 'syncing';
}
function isSyncComplete(value?: SyncStatus) {
  return value?.state === 'complete' || value?.history === 'complete';
}
function mergeDefined<T extends object>(base: T | undefined, patch: T): T {
  return Object.fromEntries(
    Object.entries({ ...base, ...patch }).filter(([, value]) => value !== undefined),
  ) as T;
}
function unwrap(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const root = value as Record<string, unknown>;
  return root[key] && typeof root[key] === 'object' ? (root[key] as Record<string, unknown>) : root;
}
