import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Chat } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar.component';
import { previewFor } from '../../../shared/utils/display';

@Component({
  selector: 'app-chat-sidebar',
  imports: [ScrollingModule, FormsModule, DatePipe, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-sidebar.component.html',
  styleUrl: './chat-sidebar.component.scss',
})
export class ChatSidebarComponent {
  chats = input.required<Chat[]>();
  selectedId = input<string>();
  loading = input(false);
  chatSelected = output<Chat>();
  readonly query = signal('');
  readonly debouncedQuery = signal('');
  private timer?: ReturnType<typeof setTimeout>;
  readonly filtered = computed(() => {
    const q = this.debouncedQuery().trim().toLocaleLowerCase();
    return q
      ? this.chats().filter((c) =>
          (c.displayName + ' ' + (c.preview ?? '')).toLocaleLowerCase().includes(q),
        )
      : this.chats();
  });
  updateSearch(value: string) {
    this.query.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.debouncedQuery.set(value), 300);
  }
  select(chat: Chat) {
    this.chatSelected.emit(chat);
  }
  trackById = (_: number, chat: Chat) => chat.id;
  preview(chat: Chat) {
    if (chat.waitingSeed || chat.historyStatus === 'waiting_seed') return 'Historial pendiente';
    if (chat.historyStatus === 'pending') return 'Pendiente de recuperación';
    if (chat.historyStatus === 'fetching') return 'Recuperando historial…';
    if (chat.historyStatus === 'timeout') return 'Reintento pendiente';
    return chat.preview || previewFor(undefined, chat.preview);
  }
}
