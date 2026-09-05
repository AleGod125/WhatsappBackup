import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OnboardingService, OnboardingStatus } from '../../../core/services/onboarding.service';
import { WebCompanionService } from '../../../core/services/web-companion.service';

/**
 * El paso 2 de la puesta en marcha, y lo que viene después.
 *
 * POR QUE HAY DOS CODIGOS
 * -----------------------
 * Son dos dispositivos vinculados distintos, cada uno con su propia sesión y
 * su propia identidad criptográfica. No se pueden fusionar: intentar que
 * compartan sesión rompería el cifrado de los dos. Lo que sí se puede es
 * dejar de presentarlos como una herramienta de laboratorio.
 *
 * El segundo vínculo sirve para una cosa concreta: WhatsApp no entrega en la
 * sincronización inicial una referencia de cada conversación, y sin ella no se
 * le puede pedir el historial. El segundo dispositivo sí las ve.
 *
 * LO QUE ESTE PANEL NO HACE
 * -------------------------
 * No dispara nada. El backend sondea, valida, aplica y encola solo, en cuanto
 * se dan las condiciones. Aquí se cuenta lo que está pasando y, si hace falta
 * escanear algo, se enseña.
 */
@Component({
  selector: 'app-onboarding-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <section class="onboarding" [class.destacado]="necesitaQr()">
        @if (necesitaQr()) {
          <header>
            <span class="paso">Opcional</span>
            <h3>Mejorar la recuperación</h3>
          </header>
          <p class="explica">
            {{ cuantasFaltan() }} necesitan una segunda vinculación para intentar
            recuperar su historial. WhatsApp no entrega una referencia de cada
            conversación al vincular, y sin ella no se le puede pedir lo anterior.
          </p>
          <div class="qr">
            <img [src]="qrUrl()" alt="Código QR para activar la recuperación completa" />
          </div>
          <p class="pasos">
            En tu teléfono: <b>WhatsApp</b> › <b>Dispositivos vinculados</b> ›
            <b>Vincular un dispositivo</b>.
          </p>
          <p class="fino">Puedes seguir usando la aplicación mientras tanto.</p>
        } @else {
          <header>
            <span class="punto" [class]="tono()"></span>
            <h3>{{ titulo() }}</h3>
          </header>
          @if (detalle(); as d) {
            <p class="explica">{{ d }}</p>
          }
          @if (progreso(); as p) {
            <div class="barra" role="progressbar" [attr.aria-valuenow]="p">
              <i [style.width.%]="p"></i>
            </div>
            <p class="fino">{{ recuento() }}</p>
          }
        }
      </section>
    }
  `,
  styles: [
    `
      .onboarding {
        display: grid;
        gap: 10px;
        padding: 14px;
        border-top: 1px solid var(--border);
      }
      .onboarding.destacado {
        background: color-mix(in srgb, var(--accent) 7%, transparent);
      }
      header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      h3 {
        margin: 0;
        font-size: var(--font-size-sm);
        font-weight: 550;
      }
      .paso {
        font-size: var(--font-size-xs);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--accent);
        color: #06251d;
        font-weight: 700;
      }
      .punto {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--text-muted);
      }
      .punto.activo {
        background: #d9a441;
        animation: latido 1.4s ease-in-out infinite;
      }
      .punto.ok {
        background: var(--accent);
      }
      .punto.aviso {
        background: #d98441;
      }
      @keyframes latido {
        50% {
          opacity: 0.35;
        }
      }
      .explica,
      .pasos {
        margin: 0;
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
        line-height: 1.5;
      }
      .fino {
        margin: 0;
        font-size: var(--font-size-xs);
        color: var(--text-muted);
      }
      .qr {
        display: grid;
        justify-items: center;
      }
      /* Pixelado a propósito: el backend genera el código con un número entero
         de píxeles por módulo y reescalarlo difumina los bordes. */
      .qr img {
        max-width: 220px;
        width: 100%;
        image-rendering: pixelated;
        background: #fff;
        padding: 8px;
        border-radius: 10px;
      }
      .barra {
        height: 4px;
        border-radius: 99px;
        background: var(--bg-selected);
        overflow: hidden;
      }
      .barra i {
        display: block;
        height: 100%;
        background: var(--accent);
        transition: width 0.4s ease;
      }
    `,
  ],
})
export class OnboardingPanelComponent {
  private readonly api = inject(OnboardingService);
  private readonly webApi = inject(WebCompanionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly status = signal<OnboardingStatus | undefined>(undefined);
  private temporizador?: ReturnType<typeof setTimeout>;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.temporizador) clearTimeout(this.temporizador);
    });
    this.refrescar();
  }

  /**
   * Se deja de preguntar cuando ya no hay nada que contar.
   *
   * Mientras hay un código en pantalla se pregunta más a menudo: los códigos
   * rotan cada pocos segundos y uno caducado se escanea en vano.
   */
  private programar(cada: number) {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      this.temporizador = undefined;
      this.refrescar();
    }, cada);
  }

  refrescar() {
    this.api
      .status()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (estado) => {
          this.status.set(estado);
          if (estado.phase !== 'complete') {
            this.programar(estado.web.qrAvailable ? 5000 : 15000);
          }
        },
        // Un fallo aquí no puede estropear el panel: es información, no el
        // producto. Se reintenta más despacio, sin inventarse un estado que
        // no se conoce.
        error: () => this.programar(30000),
      });
  }

  readonly visible = computed(() => {
    const s = this.status();
    if (!s) return false;
    // Terminado no ocupa sitio. Y si la recuperación completa está apagada,
    // este panel no tiene nada que decir.
    if (s.phase === 'complete') return false;
    // La conexion principal manda. Sin ella este panel entero desaparece:
    // hablar del segundo dispositivo mientras falta el primero es lo que dejo
    // al usuario escaneando el codigo equivocado.
    if (this.faltaLaPrincipal()) return false;
    return s.web.enabled || s.phase === 'waiting_for_phone';
  });

  /** Falta el primer vinculo, o se esta reconectando. El segundo espera. */
  readonly faltaLaPrincipal = computed(() => {
    const s = this.status();
    if (!s) return false;
    return s.phase === 'pairing_primary' || s.phase === 'reconnecting' || !s.primaryLinked;
  });

  // Un codigo del segundo dispositivo guardado de antes de que cayera la
  // principal sigue apareciendo como disponible. No se ensena.
  readonly necesitaQr = computed(
    () => this.status()?.web.qrAvailable === true && !this.faltaLaPrincipal(),
  );

  /** Cuántas conversaciones se ganarían con el segundo vínculo. */
  readonly cuantasFaltan = computed(() => {
    const faltan = this.status()?.counts.waitingSeed ?? 0;
    return faltan === 1 ? '1 conversación' : `${faltan} conversaciones`;
  });

  qrUrl(): string {
    return this.webApi.qrImageUrl(this.status()?.web.qrGeneration ?? 0, 320);
  }

  readonly tono = computed(() => {
    const fase = this.status()?.phase;
    if (fase === 'waiting_for_phone') return 'aviso';
    if (fase === 'partial') return '';
    return 'activo';
  });

  readonly titulo = computed(() => {
    switch (this.status()?.phase) {
      case 'waiting_web':
        return 'Preparando la recuperación completa';
      case 'initial_sync':
        return 'Preparando WhatsApp';
      case 'recovering_history':
        return 'Recuperando tu historial…';
      case 'waiting_for_phone':
        return 'Esperando al teléfono';
      case 'partial':
        return 'Recuperación parcial';
      default:
        return 'Preparando…';
    }
  });

  readonly detalle = computed(() => {
    const s = this.status();
    if (!s) return '';
    switch (s.phase) {
      case 'waiting_web':
        return 'Conectando el segundo dispositivo. No hace falta que hagas nada.';
      case 'initial_sync':
        return 'Descargando lo que WhatsApp entrega al vincular.';
      case 'waiting_for_phone':
        return 'Abre WhatsApp en tu teléfono para continuar. Tu progreso está guardado.';
      case 'partial': {
        const faltan = s.counts.waitingSeed;
        if (faltan === 0) return '';
        return faltan === 1
          ? 'Queda 1 conversación sin una referencia con la que recuperar su historial.'
          : `Quedan ${faltan} conversaciones sin una referencia con la que recuperar su historial.`;
      }
      default:
        return '';
    }
  });

  /** Cuánto se lleva hecho, sobre las conversaciones que hay. */
  readonly progreso = computed(() => {
    const s = this.status();
    if (!s || s.counts.chatsTotal === 0) return undefined;
    if (s.phase === 'pairing_web' || s.phase === 'waiting_web') return undefined;
    const hechos = s.counts.exhausted;
    return Math.min(100, Math.round((hechos / s.counts.chatsTotal) * 100));
  });

  readonly recuento = computed(() => {
    const s = this.status();
    if (!s) return '';
    const partes = [`${s.counts.exhausted} de ${s.counts.chatsTotal} conversaciones`];
    const pendientes = s.counts.pending + s.counts.fetching + s.counts.timeout;
    if (pendientes > 0) partes.push(`${pendientes} en curso`);
    if (s.counts.waitingSeed > 0) partes.push(`${s.counts.waitingSeed} sin referencia`);
    return partes.join(' · ');
  });
}
