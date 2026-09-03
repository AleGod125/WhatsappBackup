import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { ChatHistoryStatus, Media, Message } from '../../../core/models/api.models';
import { MessageBubbleComponent } from '../message-bubble/message-bubble.component';

@Component({
  selector: 'app-message-list',
  imports: [MessageBubbleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.scss',
})
export class MessageListComponent {
  messages = input.required<Message[]>();
  loading = input(false);
  loadingOlder = input(false);
  hasMore = input(false);
  historyStatus = input<ChatHistoryStatus>();
  loadOlder = output<void>();
  mediaOpen = output<{ media: Media; type: Message['type'] }>();
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private cooldown = false;
  onScroll() {
    const el = this.scroller().nativeElement;
    if (
      el.scrollTop < 180 &&
      el.scrollHeight > el.clientHeight &&
      this.hasMore() &&
      !this.loadingOlder() &&
      !this.cooldown
    ) {
      this.cooldown = true;
      this.loadOlder.emit();
      setTimeout(() => (this.cooldown = false), 650);
    }
  }
  captureScroll() {
    const el = this.scroller().nativeElement;
    return { height: el.scrollHeight, top: el.scrollTop };
  }
  restoreAfterPrepend(previous: { height: number; top: number }) {
    requestAnimationFrame(() => {
      const el = this.scroller().nativeElement;
      el.scrollTop = restoredScrollTop(el.scrollHeight, previous.height, previous.top);
    });
  }
  isNearBottom(threshold = 160) {
    const el = this.scroller().nativeElement;
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }
  scrollToBottom(smooth = false) {
    const el = this.scroller().nativeElement;
    if (smooth && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }
  scrollToBottomAfterRender() {
    requestAnimationFrame(() => requestAnimationFrame(() => this.scrollToBottom()));
  }
  onMediaLayout() {
    const el = this.scroller().nativeElement;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (shouldPinAfterMediaLoad(distance)) requestAnimationFrame(() => this.scrollToBottom());
  }
  trackById = (_: number, message: Message) => message.id;
  dayChanged(index: number) {
    if (index === 0) return true;
    return (
      dayKey(this.messages()[index - 1].timestamp) !== dayKey(this.messages()[index].timestamp)
    );
  }
  grouped(index: number) {
    if (index === 0 || this.dayChanged(index)) return false;
    const previous = this.messages()[index - 1];
    const current = this.messages()[index];
    const systemTypes = [
      'missed_voice_call',
      'missed_video_call',
      'voice_call',
      'video_call',
      'encryption_notice',
      'system',
      'unknown_system',
    ];
    return (
      previous.fromMe === current.fromMe &&
      !systemTypes.includes(previous.type) &&
      !systemTypes.includes(current.type) &&
      Math.abs(new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime()) <=
        5 * 60_000
    );
  }
  dayLabel(value: string) {
    const date = new Date(value),
      today = new Date(),
      yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (dayKey(value) === dayKey(today.toISOString())) return 'Hoy';
    if (dayKey(value) === dayKey(yesterday.toISOString())) return 'Ayer';
    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }
}
const dayKey = (value: string) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
export const restoredScrollTop = (newHeight: number, oldHeight: number, oldTop: number) =>
  newHeight - oldHeight + oldTop;
export const shouldPinAfterMediaLoad = (distanceFromBottom: number, threshold = 160) =>
  distanceFromBottom < threshold;
