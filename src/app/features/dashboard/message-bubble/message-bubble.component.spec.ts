import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Message } from '../../../core/models/api.models';
import { MessageBubbleComponent } from './message-bubble.component';
const base: Message = {
  id: 'm',
  chatId: 'c',
  type: 'text',
  text: 'Hola',
  timestamp: '2026-08-10T07:33:00Z',
  fromMe: false,
};
describe('MessageBubbleComponent', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [MessageBubbleComponent],
      providers: [provideHttpClient()],
    }),
  );
  function create(message: Message) {
    const fixture = TestBed.createComponent(MessageBubbleComponent);
    fixture.componentRef.setInput('message', message);
    fixture.detectChanges();
    return fixture;
  }
  const render = (message: Message) => create(message).nativeElement as HTMLElement;
  it('renders plain text without HTML interpretation', () => {
    const root = render({ ...base, text: '<b>Hola</b>' });
    expect(root.textContent).toContain('<b>Hola</b>');
    expect(root.querySelector('b')).toBeNull();
  });
  it('renders a missed call as a centered system event', () =>
    expect(render({ ...base, type: 'missed_voice_call' }).textContent).toContain(
      'Llamada perdida',
    ));
  it('renders downloaded image media', () =>
    expect(
      render({
        ...base,
        type: 'image',
        media: {
          id: 'media',
          status: 'downloaded',
          mimeType: 'image/jpeg',
          thumbnailUrl: 'https://example.test/thumb.jpg',
          fileUrl: 'https://example.test/file.jpg',
        },
      }).querySelector('img'),
    ).not.toBeNull());
  it('keeps unavailable images visible', () =>
    expect(
      render({ ...base, type: 'image', media: { id: 'media', status: 'unavailable' } }).textContent,
    ).toContain('Archivo no disponible localmente'));
  it('renders native video controls without requiring a thumbnail', () =>
    expect(
      render({
        ...base,
        type: 'video',
        media: {
          id: 'video',
          status: 'downloaded',
          duration: 26,
          fileUrl: 'https://example.test/video.mp4',
        },
      }).querySelector('video[controls]'),
    ).not.toBeNull());
  it('renders a downloaded voice note with native audio controls', () =>
    expect(
      render({
        ...base,
        type: 'voice_note',
        media: {
          id: 'audio',
          status: 'downloaded',
          mimeType: 'audio/ogg; codecs=opus',
          fileUrl: 'https://example.test/audio.ogg',
        },
      }).querySelector('audio'),
    ).not.toBeNull());
  it('shows pending media as preparation rather than unavailable', () =>
    expect(
      render({ ...base, type: 'audio', media: { id: 'audio', status: 'pending' } }).textContent,
    ).toContain('Preparando archivo'));
});
