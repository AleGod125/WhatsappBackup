import { Injectable, NgZone, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RealtimeEnvelope } from '../models/api.models';

const EVENT_NAMES = [
  'session.state',
  'session.qr',
  'chat.updated',
  'message.created',
  'message.updated',
  'media.updated',
  'history.progress',
  'backfill.progress',
  'sync.status',
  'history.recovery.started',
  'history.recovery.progress',
  'history.recovery.completed',
  'history.seed.found',
  'history.seed.not_found',
  'history.backfill.started',
] as const;

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly zone = inject(NgZone);
  private readonly eventsSubject = new Subject<RealtimeEnvelope>();
  private readonly connectionSubject = new Subject<'connected' | 'disconnected'>();
  private source?: EventSource;
  readonly events$: Observable<RealtimeEnvelope> = this.eventsSubject.asObservable();
  readonly connection$: Observable<'connected' | 'disconnected'> =
    this.connectionSubject.asObservable();

  connect(): void {
    if (this.source) return;
    const source = new EventSource(`${environment.apiBaseUrl}/events/stream`);
    this.source = source;
    source.onopen = () => this.zone.run(() => this.connectionSubject.next('connected'));
    source.onerror = () => this.zone.run(() => this.connectionSubject.next('disconnected'));
    source.onmessage = (event) => this.emit('message', event.data);
    for (const name of EVENT_NAMES)
      source.addEventListener(name, (event) => this.emit(name, (event as MessageEvent).data));
  }
  disconnect(): void {
    this.source?.close();
    this.source = undefined;
  }
  private emit(fallbackType: string, payload: string): void {
    this.zone.run(() => {
      try {
        const parsed = JSON.parse(payload) as unknown;
        if (parsed && typeof parsed === 'object' && 'type' in parsed) {
          const envelope = parsed as RealtimeEnvelope;
          this.eventsSubject.next({ type: String(envelope.type), data: envelope.data ?? parsed });
        } else this.eventsSubject.next({ type: fallbackType, data: parsed });
      } catch {
        this.eventsSubject.next({ type: fallbackType, data: payload });
      }
    });
  }
}
