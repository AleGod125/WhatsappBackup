import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';
import { Media, MessageType } from '../../../core/models/api.models';
@Component({
  selector: 'app-media-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Visor multimedia"
    (click)="close.emit()"
  >
    <button class="close" aria-label="Cerrar" (click)="close.emit()">×</button>
    @if (type() === 'image' || type() === 'sticker') {
      <div class="zoom">
        <button aria-label="Alejar" (click)="changeZoom(-0.25)">−</button
        ><span>{{ zoom() * 100 }}%</span
        ><button aria-label="Acercar" (click)="changeZoom(0.25)">+</button>
      </div>
    }
    <div class="content" (click)="$event.stopPropagation()">
      @switch (type()) {
        @case ('image') {
          <img
            [style.transform]="'scale(' + zoom() + ')'"
            [src]="media().fileUrl"
            alt="Imagen adjunta"
          />
        }
        @case ('sticker') {
          <img [style.transform]="'scale(' + zoom() + ')'" [src]="media().fileUrl" alt="Sticker" />
        }
        @case ('video') {
          <video controls autoplay [src]="media().fileUrl" (error)="openFallback()"></video>
        }
        @case ('audio') {
          <audio controls autoplay [src]="media().fileUrl" (error)="openFallback()"></audio>
        }
      }
    </div>
  </div>`,
  styles: [
    `
      .overlay {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: grid;
        place-items: center;
        background: rgba(2, 8, 7, 0.9);
        backdrop-filter: blur(6px);
        animation: fade 0.16s;
        overflow: auto;
      }
      .overlay button {
        border: 0;
        background: rgba(255, 255, 255, 0.09);
        color: white;
        cursor: pointer;
      }
      .close {
        position: absolute;
        z-index: 2;
        right: 24px;
        top: 18px;
        width: 42px;
        height: 42px;
        border-radius: 50%;
        font-size: 30px;
      }
      .zoom {
        position: absolute;
        z-index: 2;
        top: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .zoom button {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        font-size: 20px;
      }
      .zoom span {
        font-size: 12px;
      }
      .content {
        max-width: 90vw;
        max-height: 88vh;
      }
      .content img,
      .content video {
        display: block;
        max-width: 90vw;
        max-height: 86vh;
        object-fit: contain;
        transition: transform 0.15s;
      }
      .content audio {
        width: min(550px, 80vw);
      }
      @keyframes fade {
        from {
          opacity: 0;
        }
      }
    `,
  ],
})
export class MediaViewerComponent {
  media = input.required<Media>();
  type = input.required<MessageType>();
  close = output<void>();
  zoom = signal(1);
  changeZoom(delta: number) {
    this.zoom.update((value) => Math.min(3, Math.max(0.5, value + delta)));
  }
  openFallback() {
    if (this.media().fileUrl) window.open(this.media().fileUrl, '_blank', 'noopener,noreferrer');
  }
  @HostListener('document:keydown.escape') onEscape() {
    this.close.emit();
  }
}
