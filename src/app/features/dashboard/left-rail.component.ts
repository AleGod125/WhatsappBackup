import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AppIconComponent } from '../../shared/components/app-icon.component';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
@Component({
  selector: 'app-left-rail',
  imports: [AppIconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<aside class="rail" [attr.aria-label]="'app.name' | t">
    <div class="mark">W</div>
    <nav>
      <button class="active" [attr.aria-label]="'settings.chats' | t" [title]="'settings.chats' | t">
        <app-icon name="chats" /></button
      ><button
        disabled
        [attr.aria-label]="'empty.noMedia' | t"
        [title]="'empty.noMedia' | t"
      >
        <app-icon name="media" /></button
      ><button
        class="sync-button"
        [class.running]="syncRunning()"
        [disabled]="syncDisabled()"
        [attr.aria-label]="'recovery.syncNow' | t"
        [title]="syncTooltip()"
        (click)="syncRequested.emit()"
      >
        <app-icon name="sync" />
      </button>
    </nav>
    <div class="abajo">
      <!-- La configuración del producto: idioma, tema, tipografía. Es lo que
           el usuario abre a menudo, así que va en el carril y no escondida. -->
      <button
        class="settings"
        [class.active]="settingsOpen()"
        [attr.aria-label]="'settings.title' | t"
        [title]="'settings.title' | t"
        [attr.aria-expanded]="settingsOpen()"
        (click)="settingsToggled.emit()"
      >
        <app-icon name="settings" />
      </button>
      <!-- Y la recuperación avanzada, que es otra cosa: herramientas que se
           miran de vez en cuando. -->
      <button
        class="settings avanzado"
        [class.active]="advancedOpen()"
        [attr.aria-label]="'recovery.fullRecovery' | t"
        [title]="'recovery.fullRecovery' | t"
        [attr.aria-expanded]="advancedOpen()"
        (click)="advancedToggled.emit()"
      >
        <app-icon name="tools" />
      </button>
    </div>
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
      .abajo {
        margin-top: auto;
        display: grid;
        gap: 8px;
      }
      .rail button {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
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
      /* El foco tiene que verse: en escritorio se navega con teclado. */
      .rail button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      /* El empuje hacia abajo lo lleva el grupo, no cada boton: con los
         dos sueltos, el segundo quedaba pegado al primero por casualidad. */
      .avanzado {
        color: var(--text-muted);
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
  advancedOpen = input(false);
  settingsOpen = input(false);
  syncRequested = output<void>();
  advancedToggled = output<void>();
  settingsToggled = output<void>();
}
