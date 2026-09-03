import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
interface TextSegment {
  value: string;
  url?: string;
}
@Component({
  selector: 'app-safe-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="safe-text">
    @for (segment of segments(); track $index) {
      @if (segment.url) {
        <a [href]="segment.url" target="_blank" rel="noopener noreferrer">{{ segment.value }}</a>
      } @else {
        <span>{{ segment.value }}</span>
      }
    }
  </span>`,
  styles: [
    `
      .safe-text {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .safe-text a {
        color: #72c7ff;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
    `,
  ],
})
export class SafeTextComponent {
  text = input('');
  segments = computed<TextSegment[]>(() => splitLinks(this.text()));
}
export function splitLinks(text: string): TextSegment[] {
  const regex = /(https?:\/\/[^\s<]+)/giu;
  const result: TextSegment[] = [];
  let start = 0;
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > start) result.push({ value: text.slice(start, index) });
    let value = match[0],
      suffix = '';
    while (/[),.!?:;]$/.test(value)) {
      suffix = value.slice(-1) + suffix;
      value = value.slice(0, -1);
    }
    result.push({ value, url: value });
    if (suffix) result.push({ value: suffix });
    start = index + match[0].length;
  }
  if (start < text.length) result.push({ value: text.slice(start) });
  return result;
}
