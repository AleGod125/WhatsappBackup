import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SyncStatus } from '../../../core/models/api.models';
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
    </div>
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
      }
      .sync strong,
      .sync small {
        display: block;
        font-size: 12px;
      }
      .sync strong {
        color: var(--text-primary);
        font-weight: 600;
      }
      .sync small {
        margin-top: 2px;
      }
    `,
  ],
})
export class SyncIndicatorComponent {
  status = input<SyncStatus>();
  disconnected = input(false);
  reconnecting = input(false);
}
