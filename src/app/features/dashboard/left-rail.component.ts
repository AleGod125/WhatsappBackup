import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AppIconComponent } from '../../shared/components/app-icon.component';
@Component({
  selector: 'app-left-rail',
  imports: [AppIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<aside class="rail" aria-label="Navegación principal">
    <div class="mark">W</div>
    <nav>
      <button class="active" aria-label="Chats" title="Chats"><app-icon name="chats" /></button
      ><button disabled aria-label="Multimedia" title="Multimedia"><app-icon name="media" /></button
      ><button
        class="sync-button"
        [class.running]="syncRunning()"
        [disabled]="syncDisabled()"
        aria-label="Sincronizar ahora"
        [title]="syncTooltip()"
        (click)="syncRequested.emit()"
      >
        <app-icon name="sync" />
      </button>
    </nav>
    <button disabled class="settings" aria-label="Configuración" title="Configuración">
      <app-icon name="settings" />
    </button>
  </aside>`,
  styles: [
    `
      .rail {
        width: 60px;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px 0;
        background: var(--bg-rail);
        border-right: 1px solid var(--border);
      }
      .mark {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 11px;
        background: var(--accent);
        color: #06251d;
        font-weight: 800;
        margin-bottom: 22px;
      }
      nav {
        display: grid;
        gap: 8px;
      }
      .rail button {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border: 0;
        border-radius: 10px;
        color: var(--text-secondary);
        background: transparent;
        cursor: pointer;
      }
      .rail button:hover:not(:disabled),
      .rail button.active {
        background: var(--bg-selected);
        color: var(--text-primary);
      }
      .rail button:disabled {
        opacity: 0.5;
      }
      .settings {
        margin-top: auto;
      }
      .sync-button.running app-icon {
        animation: rotate 1.2s linear infinite;
      }
      @keyframes rotate {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class LeftRailComponent {
  syncRunning = input(false);
  syncDisabled = input(false);
  syncTooltip = input('Sincronizar ahora');
  syncRequested = output<void>();
}
