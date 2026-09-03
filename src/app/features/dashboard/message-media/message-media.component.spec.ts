import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { MediaService } from '../../../core/services/media.service';
import { MessageMediaComponent } from './message-media.component';

describe('MessageMediaComponent', () => {
  const retryResult = new Subject<Record<string, unknown>>();
  const mediaApi = { retry: vi.fn(() => retryResult) };
  beforeEach(() => {
    mediaApi.retry.mockClear();
    TestBed.configureTestingModule({
      imports: [MessageMediaComponent],
      providers: [{ provide: MediaService, useValue: mediaApi }],
    });
  });
  function create(status: 'downloaded' | 'failed' | 'unavailable' = 'downloaded') {
    const fixture = TestBed.createComponent(MessageMediaComponent);
    fixture.componentRef.setInput('messageType', 'image');
    fixture.componentRef.setInput('media', {
      id: 'media-1',
      status,
      fileUrl: 'https://example.test/image.jpg',
    });
    fixture.detectChanges();
    return fixture;
  }
  it('renders failed media with retry while preserving its card', () => {
    const fixture = create('failed');
    expect(fixture.nativeElement.textContent).toContain('No se pudo cargar este archivo');
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(mediaApi.retry).toHaveBeenCalledWith('media-1');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Descargando archivo');
  });
  it('turns an image load error into a visible fallback without mutating media status', () => {
    const fixture = create();
    fixture.componentInstance.onError();
    fixture.detectChanges();
    expect(fixture.componentInstance.media()?.status).toBe('downloaded');
    expect(fixture.nativeElement.textContent).toContain('No se pudo cargar este archivo');
  });
});
