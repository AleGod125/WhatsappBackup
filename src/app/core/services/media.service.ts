import { Injectable, inject } from '@angular/core';
import { ApiClientService } from '../api/api-client.service';
@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly api = inject(ApiClientService);
  details<T>(id: string) {
    return this.api.get<T>(`/media/${encodeURIComponent(id)}`);
  }
  fileUrl(id: string) {
    return this.api.url(`/media/${encodeURIComponent(id)}/file`);
  }
  thumbnailUrl(id: string) {
    return this.api.url(`/media/${encodeURIComponent(id)}/thumbnail`);
  }
  retry(id: string) {
    return this.api.post<Record<string, unknown>>(`/media/${encodeURIComponent(id)}/retry`);
  }
}
