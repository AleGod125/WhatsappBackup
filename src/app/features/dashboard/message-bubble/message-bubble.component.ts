import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Media, Message } from '../../../core/models/api.models';
import { SafeTextComponent } from '../../../shared/components/safe-text.component';
import { MessageMediaComponent } from '../message-media/message-media.component';

@Component({
  selector: 'app-message-bubble',
  imports: [DatePipe, SafeTextComponent, MessageMediaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './message-bubble.component.html',
  styleUrl: './message-bubble.component.scss',
})
export class MessageBubbleComponent {
  message = input.required<Message>();
  grouped = input(false);
  openMedia = output<{ media: Media; type: Message['type'] }>();
  mediaLayoutChanged = output<void>();
  readonly media = computed(() => this.message().media);
  readonly system = computed(() =>
    [
      'missed_voice_call',
      'missed_video_call',
      'voice_call',
      'video_call',
      'encryption_notice',
      'system',
      'unknown_system',
    ].includes(this.message().type),
  );
  systemLabel() {
    const m = this.message();
    const labels: Record<string, string> = {
      missed_voice_call: '📞 Llamada perdida',
      missed_video_call: '📹 Videollamada perdida',
      voice_call: '📞 Llamada',
      video_call: '📹 Videollamada',
      encryption_notice: `🔒 ${m.text || 'Los mensajes están protegidos'}`,
      system: `ℹ ${m.text || 'Evento del sistema'}`,
      unknown_system: `ℹ ${m.text || 'Evento del sistema'}`,
    };
    return labels[m.type] || 'Evento del sistema';
  }
  mapUrl() {
    const m = this.message();
    return m.latitude !== undefined && m.longitude !== undefined
      ? `https://www.openstreetmap.org/?mlat=${m.latitude}&mlon=${m.longitude}#map=16/${m.latitude}/${m.longitude}`
      : undefined;
  }
}
