import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  WebCompanionInventory,
  WebCompanionProbe,
  WebCompanionService,
  WebCompanionStatus,
  WebSeedApplyResult,
} from '../../../core/services/web-companion.service';

/**
 * Panel de diagnóstico del Web Companion. Separado del flujo normal.
 *
 * Está aquí para responder a UNA pregunta con números:
 *
 *   de los chats que esperan una referencia, ¿cuántos ve WhatsApp Web y de
 *   cuántos puede dar un mensaje real?
 *
 * No promete nada. Si el resultado es cero, lo dice — que es exactamente el
 * dato que hace falta para decidir si esta vía sirve de algo.
 */
@Component({
  selector: 'app-web-companion-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="wc">
      <header>
        <h3>Web Companion</h3>
        <span class="tag">experimental</span>
      </header>

      @if (status(); as s) {
        <p class="state" [class.error]="s.state === 'error'">
          @switch (s.state) {
            @case ('disabled') {
              Desactivado. Actívalo con <code>WEB_COMPANION_ENABLED=true</code>.
            }
            @case ('qr_required') {
              Necesita su <strong>propio</strong> código QR. No sustituye al emparejamiento
              principal: es otro dispositivo vinculado.
            }
            @case ('ready') {
              @if (s.webClientReady) {
                Cliente Web listo
                @if (!s.storeReady) {
                  ; Store no disponible, prueba parcial habilitada.
                }
              } @else {
                Conectando…
              }
            }
            @case ('connected') {
              @if (s.webClientReady) {
                Cliente Web listo; preparando Store…
              } @else {
                Conectando…
              }
            }
            @case ('starting') {
              Arrancando…
            }
            @case ('stopped') {
              Detenido.
            }
            @default {
              No se pudo arrancar.
            }
          }
        </p>

        @if (s.reason && s.state !== 'ready') {
          <p class="hint">{{ s.reason }}</p>
        }

        @if (s.qrAvailable) {
          <!-- La imagen la pinta el backend, como la del pairing principal.
               La generacion va en la URL para que el navegador no reutilice
               un codigo que ya caduco. -->
          <div class="qr">
            <img [src]="qrUrl(s.qrGeneration)" alt="Código QR del Web Companion" />
            <p class="hint">Escanéalo desde <strong>Dispositivos vinculados</strong>.</p>
          </div>
        }

        <div class="acciones">
          @if (!s.running && s.canStart) {
            <button type="button" (click)="arrancar()" [disabled]="busy()">Arrancar</button>
          }
          <button
            type="button"
            (click)="medir()"
            [disabled]="busy() || !s.enabled || !s.webClientReady || s.probeRunning"
          >
            Probar cobertura Web
          </button>
          <!-- El unico boton que escribe. Solo aparece cuando hay algo que
               aplicar de verdad: sin referencias medidas no hay nada que
               continuar, y un boton que no hace nada confunde mas que ayuda. -->
          @if (puedeAplicar()) {
            <button type="button" class="primario" (click)="aplicar()" [disabled]="busy()">
              Usar referencias Web
            </button>
          }
        </div>
      } @else {
        <p class="state">Consultando…</p>
      }

      @if (error(); as e) {
        <p class="hint error">{{ e }}</p>
      }

      @if (inventory(); as inv) {
        <dl>
          <div>
            <dt>Chats en el backend</dt>
            <dd>{{ inv.pythonChats }}</dd>
          </div>
          <div>
            <dt>Chats en WhatsApp Web</dt>
            <dd>{{ inv.unionChats }}</dd>
          </div>
          <div>
            <dt>Sólo en Web</dt>
            <dd>{{ inv.extraVsPython }}</dd>
          </div>
          <div>
            <dt>Que Web no ve</dt>
            <dd>{{ inv.missingVsPython }}</dd>
          </div>
        </dl>
      }

      @if (probe(); as p) {
        <dl>
          <div>
            <dt>Esperando referencia</dt>
            <dd>{{ p.waiting }}</dd>
          </div>
          <div>
            <dt>Visibles en Web</dt>
            <dd>{{ p.visibleStore }}</dd>
          </div>
          <div>
            <dt>Con mensajes cargados</dt>
            <dd>{{ p.withMessages }}</dd>
          </div>
          <div>
            <dt>Con referencia usable</dt>
            <dd>{{ p.seedUsable }}</dd>
          </div>
          <div>
            <dt>Sin referencia</dt>
            <dd>{{ p.sinSeed }}</dd>
          </div>
        </dl>
        <p class="hint">{{ veredicto(p) }}</p>
        @if (p.readOnly) {
          <p class="hint">No se ha modificado nada: esta prueba sólo mide.</p>
        }
        @if (puedeAplicar()) {
          <p class="hint">
            Pulsa <strong>Usar referencias Web</strong> para recuperar el historial de esas
            conversaciones.
          </p>
          <!-- Recomendacion practica, no una regla del protocolo. El telefono
               puede quedarse dormido y entonces deja de contestar; no es un
               fallo, pero conviene decirlo ANTES y no cuando ya ha pasado. -->
          <p class="hint">
            Para mejorar la fiabilidad, mantén tu teléfono encendido, con Internet y WhatsApp
            abierto o activo mientras dura la recuperación.
          </p>
        }
      }

      @if (apply(); as a) {
        <p class="state">{{ resumenDeAplicacion(a) }}</p>
        <dl>
          <div>
            <dt>Referencias guardadas</dt>
            <dd>{{ a.inserted }}</dd>
          </div>
          @if (a.alreadyPresent > 0) {
            <div>
              <dt>Ya estaban</dt>
              <dd>{{ a.alreadyPresent }}</dd>
            </div>
          }
          <div>
            <dt>Conversaciones en recuperación</dt>
            <dd>{{ a.promoted }}</dd>
          </div>
          <div>
            <dt>Sin referencia en Web</dt>
            <dd>{{ a.stillWaiting }}</dd>
          </div>
        </dl>
        @if (a.queue; as q) {
          <dl>
            <div>
              <dt>Recuperadas</dt>
              <dd>{{ q.dug }} / {{ a.promoted }}</dd>
            </div>
            <div>
              <dt>Pendientes</dt>
              <dd>{{ q.pending }}</dd>
            </div>
            <div>
              <dt>Esperando al teléfono</dt>
              <dd>{{ q.waitingForPhone ? 'sí' : 'no' }}</dd>
            </div>
          </dl>
          @if (q.waitingForPhone) {
            <p class="hint error">
              Tu teléfono dejó de responder temporalmente. Abre WhatsApp y mantén el teléfono
              conectado para continuar. No se ha perdido nada de lo ya recuperado.
            </p>
            <div class="acciones">
              <button type="button" (click)="reanudar()" [disabled]="busy()">Reintentar</button>
            </div>
          } @else if (q.paused) {
            <p class="hint error">
              La recuperación se pausó porque se cortó la conexión. Se retomará donde se quedó.
            </p>
            <div class="acciones">
              <button type="button" (click)="reanudar()" [disabled]="busy()">Reintentar</button>
            </div>
          }
        }
      }
    </section>
  `,
  styles: [
    `
      .wc {
        padding: 1rem;
        display: grid;
        gap: 0.75rem;
      }
      header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      h3 {
        margin: 0;
        font-size: 1rem;
      }
      .tag {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 0.1rem 0.4rem;
        border-radius: 0.25rem;
        background: color-mix(in srgb, currentColor 12%, transparent);
      }
      .state {
        margin: 0;
      }
      .hint {
        margin: 0;
        font-size: 0.85rem;
        opacity: 0.75;
      }
      .error {
        color: #b3261e;
      }
      .qr {
        display: grid;
        gap: 0.5rem;
        justify-items: center;
      }
      /* Sin forzar un tamano: el backend lo genera con un numero ENTERO de
         pixeles por modulo, y reescalarlo en el navegador difumina los bordes
         y arruina la lectura. image-rendering protege el caso de que el
         contenedor sea mas estrecho que la imagen. */
      .qr img {
        max-width: 100%;
        image-rendering: pixelated;
        background: #fff;
        padding: 0.5rem;
        border-radius: 0.5rem;
      }
      .acciones {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .primario {
        font-weight: 600;
      }
      dl {
        margin: 0;
        display: grid;
        gap: 0.25rem;
      }
      dl > div {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
      }
      dt {
        opacity: 0.75;
      }
      dd {
        margin: 0;
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class WebCompanionPanelComponent {
  private readonly api = inject(WebCompanionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly status = signal<WebCompanionStatus | undefined>(undefined);
  readonly inventory = signal<WebCompanionInventory | undefined>(undefined);
  readonly probe = signal<WebCompanionProbe | undefined>(undefined);
  readonly apply = signal<WebSeedApplyResult | undefined>(undefined);
  readonly busy = signal(false);
  readonly error = signal<string | undefined>(undefined);

  private temporizador?: ReturnType<typeof setTimeout>;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.temporizador) clearTimeout(this.temporizador);
    });
    this.refrescar();
  }

  /**
   * Vuelve a preguntar mientras el companion aún se esté vinculando.
   *
   * El QR rota cada pocos segundos: sin esto, el panel enseñaría para siempre
   * el primero que llegó, que a los pocos segundos ya no vale.
   */
  private programarRefresco(s: WebCompanionStatus) {
    if (this.temporizador) clearTimeout(this.temporizador);
    const enCurso = ['starting', 'qr_required', 'connected'].includes(s.state);
    if (!enCurso) return;
    this.temporizador = setTimeout(() => {
      this.temporizador = undefined;
      this.refrescar();
    }, 5000);
  }

  /** La imagen del QR vigente. Cambia de URL con cada generación. */
  qrUrl(generation: number): string {
    return this.api.qrImageUrl(generation);
  }

  refrescar() {
    this.api
      .status()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.status.set(s);
          this.programarRefresco(s);
        },
        error: () => this.status.set(undefined),
      });
  }

  arrancar() {
    this.busy.set(true);
    this.error.set(undefined);
    this.api
      .start()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.status.set(s);
          this.programarRefresco(s);
          this.busy.set(false);
        },
        error: (e) => {
          this.error.set(e?.message ?? 'No se pudo arrancar.');
          this.busy.set(false);
        },
      });
  }

  medir() {
    this.busy.set(true);
    this.error.set(undefined);
    this.api
      .inventory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (inv) => {
          this.inventory.set(inv);
          this.sondear();
        },
        error: (e) => {
          this.error.set(e?.message ?? 'No se pudo leer el inventario.');
          this.busy.set(false);
        },
      });
  }

  private sondear() {
    this.api
      .probe()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.probe.set(p);
          this.busy.set(false);
        },
        error: (e) => {
          this.error.set(e?.message ?? 'No se pudo sondear.');
          this.busy.set(false);
        },
      });
  }

  veredicto(p: WebCompanionProbe): string {
    return veredictoDeCobertura(p);
  }

  /** Sólo cuando hay referencias medidas y todavía no se han aplicado. */
  puedeAplicar(): boolean {
    const p = this.probe();
    return !!p && p.seedUsable > 0 && !this.apply();
  }

  aplicar() {
    this.busy.set(true);
    this.error.set(undefined);
    this.api
      .applySeeds()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (a) => {
          this.apply.set(a);
          this.busy.set(false);
        },
        error: (e) => {
          this.error.set(e?.message ?? 'No se pudieron aplicar las referencias.');
          this.busy.set(false);
        },
      });
  }

  reanudar() {
    this.busy.set(true);
    this.error.set(undefined);
    this.api
      .resume()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (q) => {
          const anterior = this.apply();
          if (anterior) this.apply.set({ ...anterior, queue: q });
          this.busy.set(false);
        },
        error: (e) => {
          this.error.set(
            e?.message ?? 'El teléfono sigue sin responder. Abre WhatsApp y vuelve a intentarlo.',
          );
          this.busy.set(false);
        },
      });
  }

  resumenDeAplicacion(a: WebSeedApplyResult): string {
    return resumenDeAplicacion(a);
  }
}

/**
 * Lo que se hizo, en una frase, sin prometer historial que WhatsApp aún no ha
 * entregado. Se dice "iniciando", no "sincronizado": un chat sólo está
 * completo cuando el teléfono contesta que no le queda nada.
 */
export function resumenDeAplicacion(a: WebSeedApplyResult): string {
  if (a.promoted === 0) {
    return a.validated === 0
      ? 'No había ninguna referencia que aplicar.'
      : `${a.validated} referencia(s) guardadas; ninguna conversación necesitaba despertar.`;
  }
  const s = a.promoted === 1 ? '' : 's';
  return `${a.promoted} referencia${s} encontrada${s}. Iniciando recuperación del historial.`;
}

/**
 * Qué significa el resultado, dicho sin adornos.
 *
 * El caso de cero es el que importa: WhatsApp decide qué entrega a un
 * dispositivo vinculado, y un segundo dispositivo no cambia esa decisión por
 * existir. Si sale cero hay que decirlo, no disimularlo.
 */
export function veredictoDeCobertura(p: WebCompanionProbe): string {
  if (p.waiting === 0) return 'No hay conversaciones esperando una referencia.';
  if (p.seedUsable === 0) {
    return p.visibleStore === 0
      ? `WhatsApp Web no ve ninguna de las ${p.waiting} conversaciones que esperan.`
      : `WhatsApp Web ve ${p.visibleStore} de ${p.waiting}, pero ninguna tiene un mensaje real con el que pedir historial.`;
  }
  const s = p.seedUsable === 1 ? '' : 's';
  return `${p.seedUsable} de ${p.waiting} tiene${s} una referencia real en WhatsApp Web.`;
}
