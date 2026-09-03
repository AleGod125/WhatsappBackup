import { ChangeDetectionStrategy, Component, input } from '@angular/core';
export type AppIconName = 'chats' | 'media' | 'sync' | 'settings';
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
      @default {
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
