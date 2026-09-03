import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { avatarHue, initials } from '../utils/display';
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="avatar" [style.--hue]="hue()" [style.background]="color()"
    ><span class="initials">{{ letters() }}</span>
    @if (src()) {
      <img [src]="src()" alt="" loading="lazy" (error)="hideImage($event)" />
    }
  </span>`,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .avatar {
        --hue: 160;
        width: var(--avatar-size, 44px);
        height: var(--avatar-size, 44px);
        border-radius: 50%;
        display: grid;
        place-items: center;
        position: relative;
        overflow: hidden;
        flex: none;
        background: linear-gradient(145deg, hsl(var(--hue) 42% 43%), hsl(var(--hue) 35% 30%));
        color: white;
        font-size: calc(var(--avatar-size, 44px) * 0.34);
        font-weight: 650;
      }
      .avatar > * {
        grid-area: 1/1;
      }
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 1;
      }
    `,
  ],
})
export class AvatarComponent {
  name = input.required<string>();
  id = input('');
  src = input<string>();
  initialsOverride = input<string>();
  color = input<string>();
  letters = () => this.initialsOverride() || initials(this.name());
  hue = () => avatarHue(this.id() || this.name());
  hideImage(event: Event) {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
