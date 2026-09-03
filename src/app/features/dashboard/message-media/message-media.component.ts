import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Media, Message } from '../../../core/models/api.models';
import { MediaService } from '../../../core/services/media.service';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';
import { safeHttpUrl } from '../../../shared/utils/display';

@Component({
  selector: 'app-message-media',
  imports: [FileSizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './message-media.component.html',
  styleUrl: './message-media.component.scss',
})
export class MessageMediaComponent {
  private readonly mediaApi = inject(MediaService);
  media = input<Media>();
  messageType = input.required<Message['type']>();
  openMedia = output<{ media: Media; type: Message['type'] }>();
  layoutChanged = output<void>();
  readonly retrying = signal(false);
  readonly renderFailed = signal(false);
  readonly status = computed(() =>
    this.retrying() ? 'downloading' : (this.media()?.status ?? 'missing'),
  );
  readonly kind = computed(() =>
    this.messageType() === 'voice_note' ? 'audio' : this.messageType(),
  );
  private lastMedia?: Media;

  constructor() {
    effect(() => {
      const current = this.media();
      if (this.lastMedia && current !== this.lastMedia) {
        this.retrying.set(false);
        this.renderFailed.set(false);
      }
      this.lastMedia = current;
    });
  }

  retry(): void {
    const media = this.media();
    if (!media?.id || this.retrying()) return;
    this.retrying.set(true);
    this.renderFailed.set(false);
    this.mediaApi.retry(media.id).subscribe({
      error: () => {
        this.retrying.set(false);
        this.renderFailed.set(true);
      },
    });
  }
  open(): void {
    const media = this.media();
    if (!media || media.status !== 'downloaded') return;
    if (['image', 'video', 'audio', 'voice_note', 'sticker'].includes(this.messageType()))
      this.openMedia.emit({ media, type: this.messageType() });
    else {
      const url = safeHttpUrl(media.fileUrl);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
  onLoad(): void {
    this.renderFailed.set(false);
    this.layoutChanged.emit();
  }
  onError(): void {
    this.renderFailed.set(true);
    this.layoutChanged.emit();
  }
  canRetry(): boolean {
    return (
      ['failed', 'unavailable', 'expired', 'missing'].includes(this.status()) || this.renderFailed()
    );
  }
  stateLabel(): string {
    if (this.status() === 'pending' || this.status() === 'downloading')
      return this.status() === 'downloading' ? 'Descargando archivo…' : 'Preparando archivo…';
    if (this.status() === 'failed' || this.renderFailed()) return 'No se pudo cargar este archivo';
    return 'Archivo no disponible localmente';
  }
}
