import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RecheckJob, SyncStatus } from '../../../core/models/api.models';
@Component({
  selector: 'app-sync-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="sync" [class.offline]="disconnected()">
    <span></span>
    <div>
      <strong>{{
        reconnecting()
          ? 'Reconectando...'
          : disconnected()
            ? 'Desconectado'
            : status()?.state === 'running' ||
                (status()?.state === undefined && status()?.history === 'syncing')
              ? 'Sincronizando...'
              : 'Conectado'
      }}</strong>
      @if (status()?.mediaPending) {
        <small>{{ status()?.mediaPending }} archivos pendientes</small>
      } @else if (status()?.backfillTotal) {
        <small>{{ status()?.backfillCurrent }}/{{ status()?.backfillTotal }}</small>
      }
      @if (recheckRunning()) {
        <small class="checking">Revisando historiales pendientes…</small>
      } @else if (status()?.waitingSeed; as waiting) {
        <small class="warning"
          >{{ waiting }}
          {{ waiting === 1 ? 'conversación pendiente' : 'conversaciones pendientes' }} de una
          referencia de WhatsApp</small
        >
      }
    </div>
    @if (hasRecoverySummary()) {
      <details>
        <summary>Resumen</summary>
        <span>Sincronizados: {{ status()?.synced ?? 0 }}</span>
        <span>Pendientes de referencia: {{ status()?.waitingSeed ?? 0 }}</span>
        <span>En cola de recuperación: {{ status()?.pending ?? 0 }}</span>
        <span>Timeouts: {{ status()?.timeouts ?? 0 }}</span>
        <span>Errores: {{ status()?.errors ?? 0 }}</span>
        @if ((status()?.waitingSeed ?? 0) > 0) {
          <button type="button" (click)="recheckPending.emit()">
            Revisar historiales pendientes
          </button>
        }
      </details>
    }
  </div>`,
  styles: [
    `
      .sync {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 10px 14px;
        border-top: 1px solid var(--border);
        color: var(--text-secondary);
      }
      .sync > span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 0 4px rgba(68, 199, 151, 0.08);
      }
      .sync.offline > span {
        background: #e4a855;
      }
      .sync div {
        min-width: 0;
        flex: 1;
      }
      .sync strong,
      .sync small {
        display: block;
        font-size: var(--font-size-sm);
      }
      .sync strong {
        color: var(--text-primary);
        font-weight: 600;
      }
      .sync small {
        margin-top: 2px;
      }
      .warning {
        color: #d9ae70;
        white-space: normal;
      }
      .checking {
        color: var(--accent);
      }
      details {
        position: relative;
        font-size: var(--font-size-xs);
      }
      summary {
        cursor: pointer;
        color: var(--accent);
      }
      details[open] {
        position: absolute;
        z-index: 8;
        left: 10px;
        right: 10px;
        bottom: 48px;
        display: grid;
        gap: 5px;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--bg-panel);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      }
      details button {
        margin-top: 5px;
        padding: 7px;
        border: 1px solid var(--border);
        border-radius: 7px;
        background: transparent;
        color: var(--text-secondary);
      }
    `,
  ],
})
export class SyncIndicatorComponent {
  status = input<SyncStatus>();
  disconnected = input(false);
  reconnecting = input(false);
  recheck = input<RecheckJob>();
  recheckPending = output<void>();
  /** La revision de fondo esta en marcha (no una que se omitio por la espera). */
  recheckRunning() {
    const job = this.recheck();
    return !!job && !job.skipped && (job.state === 'starting' || job.state === 'running');
  }
  hasRecoverySummary() {
    const value = this.status();
    return [value?.synced, value?.waitingSeed, value?.timeouts, value?.errors, value?.pending].some(
      (item) => item !== undefined,
    );
  }
}
