import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';
describe('SessionService API', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('reads QR availability without storing QR text', () => {
    const service = TestBed.inject(SessionService);
    let result: { available: boolean; imageUrl?: string } | undefined;
    service.qr().subscribe((value) => (result = value));
    TestBed.inject(HttpTestingController)
      .expectOne('http://127.0.0.1:5000/api/v1/session/qr')
      .flush({ available: true, image_url: '/api/v1/session/qr/image' });
    expect(result?.available).toBe(true);
  });
  it('uses the QR generation in the image URL', () =>
    expect(TestBed.inject(SessionService).qrImageUrl(12)).toBe(
      'http://127.0.0.1:5000/api/v1/session/qr/image?generation=12&size=560',
    ));
});
