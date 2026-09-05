import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppIconComponent } from './app-icon.component';

/** Las velocidades. Más de tres opciones convierte un botón en un menú. */
const VELOCIDADES = [1, 1.5, 2] as const;

/**
 * Sólo uno suena a la vez.
 *
 * Es de módulo y no de componente a propósito: hay un reproductor por cada
 * nota de voz, y sin esto pulsar el segundo dejaría los dos sonando encima.
 * Una conversación puede tener cientos.
 */
let sonando: HTMLAudioElement | null = null;

/**
 * El reproductor de notas de voz.
 *
 * NO toca la descarga de archivos: recibe una URL que la capa de media ya
 * resolvió y se limita a reproducirla. «No disponible» y «caducado» son
 * estados del backend —`404` y `410`— y aquí sólo se pintan.
 */
@Component({
  selector: 'app-audio-player',
  standalone: true,
  imports: [TranslatePipe, AppIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (estado() === 'unavailable' || estado() === 'expired') {
      <p class="nodisponible">
        {{ (estado() === 'expired' ? 'media.expired' : 'media.unavailable') | t }}
        @if (estado() === 'expired') {
          <small>{{ 'media.expiredHint' | t }}</small>
        }
      </p>
    } @else {
      <div class="reproductor">
        <button
          type="button"
          class="jugar"
          [attr.aria-label]="(reproduciendo() ? 'media.pause' : 'media.play') | t"
          [disabled]="!url()"
          (click)="alternar()"
        >
          <app-icon [name]="reproduciendo() ? 'pause' : 'play'" />
        </button>

        <div class="pista">
          <input
            type="range"
            class="barra"
            min="0"
            [max]="duracion() || 0"
            [value]="posicion()"
            [attr.aria-label]="'media.play' | t"
            (input)="buscar($any($event.target).valueAsNumber)"
          />
          <span class="tiempos">
            <span>{{ reloj(posicion()) }}</span>
            <span>{{ reloj(duracion()) }}</span>
          </span>
        </div>

        <button
          type="button"
          class="velocidad"
          [attr.aria-label]="'media.speedLabel' | t"
          [title]="'media.speedLabel' | t"
          (click)="siguienteVelocidad()"
        >
          {{ velocidad() }}×
        </button>

        <audio
          #audio
          [src]="url()"
          preload="metadata"
          (loadedmetadata)="duracion.set(audioEl().duration || 0)"
          (timeupdate)="posicion.set(audioEl().currentTime)"
          (ended)="alTerminar()"
          (pause)="reproduciendo.set(false)"
          (play)="reproduciendo.set(true)"
        ></audio>
      </div>
    }
  `,
  styleUrl: './audio-player.component.scss',
})
export class AudioPlayerComponent {
  url = input<string | undefined>(undefined);
  /** El estado que dice la capa de media. Aquí sólo se pinta. */
  estado = input<'loading' | 'ready' | 'unavailable' | 'expired' | undefined>('ready');

  private readonly audio = viewChild<ElementRef<HTMLAudioElement>>('audio');

  readonly reproduciendo = signal(false);
  readonly posicion = signal(0);
  readonly duracion = signal(0);
  readonly velocidad = signal<number>(1);

  audioEl(): HTMLAudioElement {
    return this.audio()!.nativeElement;
  }

  alternar(): void {
    const el = this.audioEl();
    if (el.paused) {
      // Se para el que estuviera sonando antes de empezar éste.
      if (sonando && sonando !== el) sonando.pause();
      sonando = el;
      void el.play();
    } else {
      el.pause();
    }
  }

  buscar(segundo: number): void {
    this.audioEl().currentTime = segundo;
    this.posicion.set(segundo);
  }

  siguienteVelocidad(): void {
    const actual = VELOCIDADES.indexOf(this.velocidad() as (typeof VELOCIDADES)[number]);
    const siguiente = VELOCIDADES[(actual + 1) % VELOCIDADES.length];
    this.velocidad.set(siguiente);
    this.audioEl().playbackRate = siguiente;
  }

  alTerminar(): void {
    this.reproduciendo.set(false);
    this.posicion.set(0);
    if (sonando === this.audioEl()) sonando = null;
  }

  /** `m:ss`. Con horas no hace falta: son notas de voz. */
  reloj(segundos: number): string {
    if (!Number.isFinite(segundos) || segundos < 0) return '0:00';
    const minutos = Math.floor(segundos / 60);
    const resto = Math.floor(segundos % 60);
    return `${minutos}:${String(resto).padStart(2, '0')}`;
  }
}
