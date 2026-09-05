import { ChangeDetectionStrategy, Component, input } from '@angular/core';
/**
 * Los iconos de la aplicación.
 *
 * Cada uno tiene que significar UNA cosa. Se midió el problema contrario: el
 * engranaje se usaba para «configuración» y para «recuperación avanzada», y
 * con dos botones iguales en el mismo carril no había forma de saber cuál era
 * cuál. Un icono ambiguo es peor que no tener icono.
 */
export type AppIconName =
  | 'chats'
  | 'media'
  | 'sync'
  | 'settings'
  | 'tools'
  | 'search'
  | 'more'
  | 'edit'
  | 'play'
  | 'pause'
  | 'document'
  | 'link'
  | 'chevron';
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    @switch (name()) {
      @case ('chats') {
        <path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.5-4A9 9 0 1 1 21 12Z" />
        <path d="M8 12h.01M12 12h.01M16 12h.01" />
      }
      @case ('media') {
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="m3 16 5-5 4 4 3-3 6 6" />
        <circle cx="16.5" cy="8.5" r="1.5" />
      }
      @case ('sync') {
        <path d="M20 7h-5V2" />
        <path d="M20 7a8 8 0 1 0 1.3 7" />
      }
      @case ('tools') {
        <!-- Llave inglesa: herramientas de diagnóstico. NO es el engranaje
             de configuración, que es otra cosa y va aparte. -->
        <path
          d="M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3l9.4-9.4Z"
        />
        <path d="M14.7 6.3 12 3.6a4 4 0 0 1 5.7 0" />
      }
      @case ('search') {
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      }
      @case ('more') {
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="19" r="1" />
      }
      @case ('edit') {
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      }
      @case ('play') {
        <path d="M7 4.5v15l13-7.5Z" fill="currentColor" stroke="none" />
      }
      @case ('pause') {
        <path d="M8 4.5v15M16 4.5v15" stroke-width="3" />
      }
      @case ('document') {
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
        <path d="M14 3v5h5" />
      }
      @case ('link') {
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 7" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 1 0 11 18.7l1.5-1.5" />
      }
      @case ('chevron') {
        <path d="m6 9 6 6 6-6" />
      }
      @default {
        <!-- Engranaje: configuración. El clásico, porque es el que la gente
             busca sin tener que leer el tooltip. -->
        <circle cx="12" cy="12" r="3" />
        <path
          d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"
        />
      }
    }
  </svg>`,
  styles: [
    `
      :host {
        display: inline-flex;
        width: 22px;
        height: 22px;
      }
      svg {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class AppIconComponent {
  name = input.required<AppIconName>();
}
