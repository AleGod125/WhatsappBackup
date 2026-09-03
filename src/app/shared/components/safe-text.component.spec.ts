import { splitLinks } from './safe-text.component';
describe('safe text links', () => {
  it('splits HTTP links without creating HTML', () =>
    expect(splitLinks('Visita https://example.com ahora')).toEqual([
      { value: 'Visita ' },
      { value: 'https://example.com', url: 'https://example.com' },
      { value: ' ahora' },
    ]));
  it('keeps trailing punctuation outside links', () =>
    expect(splitLinks('https://example.com.')).toEqual([
      { value: 'https://example.com', url: 'https://example.com' },
      { value: '.' },
    ]));
});
