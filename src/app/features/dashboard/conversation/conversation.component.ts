import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnChanges,
  SimpleChanges,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Chat, Media, Message, MessageCursor } from '../../../core/models/api.models';
import { MessageService } from '../../../core/services/message.service';
import { AvatarComponent } from '../../../shared/components/avatar.component';
import { MessageListComponent } from '../message-list/message-list.component';
import { MediaViewerComponent } from '../media/media-viewer.component';
import { SyncService } from '../../../core/services/sync.service';

@Component({
  selector: 'app-conversation',
  imports: [DatePipe, AvatarComponent, MessageListComponent, MediaViewerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversation.component.html',
  styleUrl: './conversation.component.scss',
})
export class ConversationComponent implements OnChanges {
  chat = input.required<Chat>();
  private readonly messagesApi = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly syncApi = inject(SyncService);
  private readonly list = viewChild(MessageListComponent);
  readonly messages = signal<Message[]>([]);
  readonly loading = signal(true);
  readonly loadingOlder = signal(false);
  readonly hasMore = signal(false);
  readonly newMessages = signal(0);
  readonly viewer = signal<{ media: Media; type: Message['type'] } | undefined>(undefined);
  readonly historyRetrying = signal(false);
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
  retryHistory() {
    if (this.historyRetrying()) return;
    this.historyRetrying.set(true);
    this.syncApi
      .run()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.historyRetrying.set(false),
        error: () => this.historyRetrying.set(false),
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
