import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnChanges,
  SimpleChanges,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Chat, Media, Message, MessageCursor, RecheckJob } from '../../../core/models/api.models';
import { MessageService } from '../../../core/services/message.service';
import { AvatarComponent } from '../../../shared/components/avatar.component';
import { MessageListComponent } from '../message-list/message-list.component';
import { MediaViewerComponent } from '../media/media-viewer.component';
import { ChatMenuComponent } from './chat-menu.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { PreferencesService } from '../../../core/services/preferences.service';
import { nombreVisible } from '../../../shared/utils/nombre-visible';
import { HistoryRecheckPanelComponent } from '../recheck/history-recheck-panel.component';
import { HistoryRecheckService } from '../../../core/services/history-recheck.service';

import { estadoDeChat } from '../chat-estado';

@Component({
  selector: 'app-conversation',
  imports: [
    DatePipe,
    AvatarComponent,
    MessageListComponent,
    MediaViewerComponent,
    HistoryRecheckPanelComponent,
    ChatMenuComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversation.component.html',
  styleUrl: './conversation.component.scss',
})
export class ConversationComponent implements OnChanges {
  private readonly prefs = inject(PreferencesService);
  private readonly i18n = inject(I18nService);

  /**
   * El nombre que se enseña: alias del usuario, nombre resuelto, o un texto
   * de espera mientras la metadata sigue llegando.
   */
  readonly nombre = computed(() =>
    nombreVisible(this.chat(), this.prefs.alias(this.chat().id), this.i18n.t()),
  );

  /** Aviso discreto tras renombrar. Lo recoge el tablero. */
  readonly aliasGuardado = output<void>();
  avisarDeGuardado(): void {
    this.aliasGuardado.emit();
  }

  /** El estado de este chat, decidido en `chat-estado` y no aquí. */
  readonly estado = computed(() => estadoDeChat(this.chat(), this.waitingForPhone()));
  /** Lo dice la cola de recuperación, no el chat. */
  waitingForPhone = input(false);

  chat = input.required<Chat>();
  private readonly messagesApi = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly recheckApi = inject(HistoryRecheckService);
  private readonly list = viewChild(MessageListComponent);
  readonly messages = signal<Message[]>([]);
  readonly loading = signal(true);
  readonly loadingOlder = signal(false);
  readonly hasMore = signal(false);
  readonly newMessages = signal(0);
  readonly viewer = signal<{ media: Media; type: Message['type'] } | undefined>(undefined);
  readonly recheckOpen = signal(false);
  readonly recheckJob = signal<RecheckJob | undefined>(undefined);
  readonly recheckError = signal<string | undefined>(undefined);
  private cursor?: MessageCursor;
  private loadToken = 0;
  ngOnChanges(changes: SimpleChanges) {
    if (changes['chat']) this.loadInitial();
  }
  loadOlder() {
    if (this.loadingOlder() || !this.hasMore() || !this.cursor) return;
    const snapshot = this.list()?.captureScroll();
    const chatId = this.chat().id;
    const generation = this.loadToken;
    this.loadingOlder.set(true);
    this.messagesApi
      .list(chatId, 200, this.cursor)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (chatId !== this.chat().id || generation !== this.loadToken) {
            this.loadingOlder.set(false);
            return;
          }
          const known = new Set(this.messages().map((m) => m.id));
          this.messages.set([...page.items.filter((m) => !known.has(m.id)), ...this.messages()]);
          this.cursor = page.nextCursor;
          this.hasMore.set(page.hasMore);
          this.loadingOlder.set(false);
          if (snapshot) this.list()?.restoreAfterPrepend(snapshot);
        },
        error: () => this.loadingOlder.set(false),
      });
  }
  append(message: Message) {
    if (message.chatId !== this.chat().id || this.messages().some((item) => item.id === message.id))
      return;
    const follow = this.list()?.isNearBottom() ?? true;
    this.messages.update((items) => [...items, message]);
    if (follow) queueMicrotask(() => this.list()?.scrollToBottom(true));
    else this.newMessages.update((count) => count + 1);
  }
  update(message: Message) {
    if (message.chatId && message.chatId !== this.chat().id) return;
    this.messages.update((items) =>
      items.map((item) => (item.id === message.id ? { ...item, ...message } : item)),
    );
  }
  updateMedia(messageId: string, media: Media) {
    this.messages.update((items) =>
      items.map((item) =>
        item.id === messageId || item.media?.id === media.id ? { ...item, media } : item,
      ),
    );
  }
  showNewest() {
    this.newMessages.set(0);
    this.list()?.scrollToBottom(true);
  }
  /**
   * Vuelve a comprobar si esta conversacion ya tiene una referencia.
   *
   * Solo mira lo local: alias del contacto y datos que WhatsApp ya entrego.
   * Si aparece una referencia, el historial se descarga solo; si no, el chat
   * sigue pendiente, que es reintentable y no un fallo.
   */
  recheckHistory() {
    const chatId = Number(this.chat().id);
    if (!Number.isInteger(chatId)) return;
    this.recheckOpen.set(true);
    this.recheckJob.set(undefined);
    this.recheckError.set(undefined);
    this.recheckApi
      .recheckChat(chatId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.recheckJob.set(job);
          if (job.recovered) this.reload();
        },
        error: (error: { message: string }) => this.recheckError.set(error.message),
      });
  }
  reload() {
    this.loadInitial();
  }
  private loadInitial() {
    const token = ++this.loadToken;
    this.messages.set([]);
    this.newMessages.set(0);
    this.loading.set(true);
    this.cursor = undefined;
    this.messagesApi
      .list(this.chat().id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (token !== this.loadToken) return;
          this.messages.set(page.items);
          this.cursor = page.nextCursor;
          this.hasMore.set(page.hasMore);
          this.loading.set(false);
          this.list()?.scrollToBottomAfterRender();
        },
        error: () => {
          if (token === this.loadToken) this.loading.set(false);
        },
      });
  }
}
