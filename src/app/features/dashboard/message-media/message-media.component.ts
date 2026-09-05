import { AudioPlayerComponent } from '../../../shared/components/audio-player.component';
import { DocumentCardComponent } from '../../../shared/components/document-card.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Media, Message } from '../../../core/models/api.models';
import { MediaService } from '../../../core/services/media.service';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';
import { safeHttpUrl } from '../../../shared/utils/display';

@Component({
  selector: 'app-message-media',
  imports: [FileSizePipe,
    AudioPlayerComponent,
    DocumentCardComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './message-media.component.html',
  styleUrl: './message-media.component.scss',
})
export class MessageMediaComponent {
  private readonly mediaApi = inject(MediaService);
  private readonly destroyRef = inject(DestroyRef);
  media = input<Media>();
  messageType = input.required<Message['type']>();
  openMedia = output<{ media: Media; type: Message['type'] }>();
  layoutChanged = output<void>();
  readonly retrying = signal(false);
  readonly renderFailed = signal(false);
  /**
   * El estado del backend, traducido al que entienden las tarjetas.
   *
   * `404` es «no disponible» y `410` es «caducado», y son cosas distintas:
   * una puede volver y la otra no. Mezclarlas dejaría al usuario sin saber si
   * merece la pena reintentar.
   */
  readonly estadoDeMedia = computed(() => {
    const estado = this.status();
    if (estado === 'expired') return 'expired' as const;
    if (['failed', 'unavailable', 'missing'].includes(estado)) return 'unavailable' as const;
    if (['pending', 'downloading'].includes(estado)) return 'loading' as const;
    return 'ready' as const;
  });

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
    // Al cambiar de chat el componente muere, pero la descarga sigue en el
    // backend: sin esto la suscripción quedaría viva escribiendo señales de un
    // componente ya destruido.
    this.mediaApi
      .retry(media.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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
