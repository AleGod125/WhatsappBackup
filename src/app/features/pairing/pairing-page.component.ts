import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AppError, QrStatus, SessionState, SessionStateCode } from '../../core/models/api.models';
import { RealtimeService } from '../../core/events/realtime.service';
import { SessionService, normalizeSession } from '../../core/services/session.service';

export type PairingViewState =
  'loading' | 'waiting_qr' | 'qr_ready' | 'scanned' | 'connecting' | 'connected' | 'error';

@Component({
  selector: 'app-pairing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pairing-page.component.html',
  styleUrl: './pairing-page.component.scss',
})
export class PairingPageComponent implements OnInit {
  private readonly session = inject(SessionService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private countdownTimer?: ReturnType<typeof setInterval>;
  private qrPollTimer?: ReturnType<typeof setInterval>;
  private fallbackTimer?: ReturnType<typeof setTimeout>;
  private redirectTimer?: ReturnType<typeof setTimeout>;
  private pairingRequested = false;
  private failedGeneration?: number;
  private qrRequestInFlight = false;

  readonly state = signal<SessionStateCode>('STARTING');
  readonly viewState = signal<PairingViewState>('loading');
  readonly busy = signal(true);
  readonly error = signal<string | undefined>(undefined);
  readonly qrUrl = signal<string | undefined>(undefined);
  readonly generation = signal<number | undefined>(undefined);
  readonly remainingSeconds = signal(300);
  readonly fallbackVisible = signal(false);
  readonly expired = signal(false);
  readonly platform = signal<'android' | 'iphone'>('android');
  readonly linked = signal(false);
  readonly countdown = computed(() => {
    const seconds = this.remainingSeconds();
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });
  readonly title = computed(() =>
    this.linked()
      ? 'Cuenta vinculada'
      : this.qrUrl()
        ? 'Escanea el código QR'
        : this.error()
          ? 'No pudimos preparar el código'
          : 'Preparando tu código QR',
  );
  readonly status = computed(() =>
    this.linked()
      ? 'Conexión confirmada. Abriendo tus conversaciones…'
      : this.error()
        ? 'Puedes volver a intentarlo sin perder información.'
        : this.expired()
          ? 'El código venció. Estamos generando uno nuevo…'
          : this.qrUrl()
            ? 'Esperando confirmación desde tu teléfono'
            : 'Conectando de forma segura con WhatsApp…',
  );

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.clearTimers());
    if (this.route.snapshot.queryParamMap.get('offline'))
      this.fail('No se pudo conectar con el servicio de WhatsApp Backup.');
    this.realtime.connect();
    this.realtime.events$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event.type === 'session.qr') this.acceptQr(this.normalizeQrEvent(event.data));
      if (event.type === 'session.state' && event.data && typeof event.data === 'object')
        this.applyState(normalizeSession(event.data as Record<string, unknown>));
    });
    this.bootstrap();
  }

  private bootstrap(): void {
    this.error.set(undefined);
    this.fallbackVisible.set(false);
    this.busy.set(true);
    this.viewState.set('loading');
    this.session
      .getSession()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.state.set(value.state);
          if (value.connected) {
            this.completePairing();
            return;
          }
          if (value.whatsappEnabled === false) {
            this.fail('El backend está en modo local. La vinculación no está disponible.');
            return;
          }
          this.viewState.set('waiting_qr');
          this.checkQr(() => {
            if (['NO_SESSION', 'PAIRING_REQUIRED', 'SESSION_INVALID'].includes(value.state))
              this.beginPairing();
            else {
              this.beginPolling();
              this.armFallback();
            }
          });
        },
        error: (error: AppError) => this.fail(error.message),
      });
  }

  retryPairing(): void {
    this.pairingRequested = false;
    this.error.set(undefined);
    this.expired.set(false);
    this.fallbackVisible.set(false);
    this.beginPairing();
  }
  setPlatform(platform: 'android' | 'iphone'): void {
    this.platform.set(platform);
  }
  onQrImageError(): void {
    this.failedGeneration = this.generation();
    this.qrUrl.set(undefined);
    this.viewState.set('waiting_qr');
    this.busy.set(true);
    this.checkQr(() => {
      this.expired.set(true);
      this.beginPolling();
    });
  }
  onQrLoaded(): void {
    this.busy.set(false);
    this.viewState.set('qr_ready');
  }
  refresh(): void {
    this.bootstrap();
  }

  private loadSession(): void {
    this.session
      .getSession()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => this.applyState(value),
        error: (error: AppError) => this.fail(error.message),
      });
  }
  private applyState(value: SessionState): void {
    this.state.set(value.state);
    if (value.connected) {
      this.completePairing();
      return;
    }
    if (this.viewState() === 'qr_ready' && this.qrUrl()) return;
    this.viewState.set(value.state === 'CONNECTING' ? 'connecting' : 'waiting_qr');
    this.busy.set(true);
    this.checkQr(() => {
      this.beginPolling();
      this.armFallback();
    });
  }
  private beginPairing(): void {
    if (this.pairingRequested || this.linked()) return;
    this.pairingRequested = true;
    this.busy.set(true);
    this.viewState.set('waiting_qr');
    this.state.set('PAIRING');
    this.session
      .pair()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.pairingRequested = false;
          if (value.connected) this.completePairing();
          else
            this.checkQr(() => {
              this.beginPolling();
              this.armFallback();
            });
        },
        error: (error: AppError) => {
          this.pairingRequested = false;
          this.fail(error.message);
        },
      });
  }
  private checkQr(onUnavailable?: () => void): void {
    if (this.qrRequestInFlight) return;
    this.qrRequestInFlight = true;
    this.session
      .qr()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (qr) => {
          this.qrRequestInFlight = false;
          if (qr.available && qr.generation !== this.failedGeneration) this.acceptQr(qr);
          else onUnavailable?.();
        },
        error: () => {
          this.qrRequestInFlight = false;
          onUnavailable?.();
        },
      });
  }
  private acceptQr(qr: QrStatus): void {
    if (!qr.available && qr.generation === undefined) return;
    const generation = qr.generation ?? this.generation();
    this.failedGeneration = undefined;
    this.generation.set(generation);
    this.qrUrl.set(generation === undefined ? qr.imageUrl : this.session.qrImageUrl(generation));
    this.state.set('QR_READY');
    this.viewState.set('qr_ready');
    this.busy.set(false);
    this.error.set(undefined);
    this.expired.set(false);
    this.fallbackVisible.set(false);
    this.stopPolling();
    this.startCountdown(qr);
  }
  private normalizeQrEvent(data: unknown): QrStatus {
    const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const value =
      root['qr'] && typeof root['qr'] === 'object' ? (root['qr'] as Record<string, unknown>) : root;
    return {
      available: value['available'] !== false,
      imageUrl: typeof value['image_url'] === 'string' ? value['image_url'] : undefined,
      generation: typeof value['generation'] === 'number' ? value['generation'] : undefined,
      expiresAt: typeof value['expires_at'] === 'string' ? value['expires_at'] : undefined,
      expiresInSeconds:
        typeof value['expires_in_seconds'] === 'number' ? value['expires_in_seconds'] : undefined,
    };
  }
  private startCountdown(qr: QrStatus): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    const fromDate = qr.expiresAt
      ? Math.max(0, Math.ceil((Date.parse(qr.expiresAt) - Date.now()) / 1000))
      : undefined;
    this.remainingSeconds.set(qr.expiresInSeconds ?? fromDate ?? 300);
    this.countdownTimer = setInterval(() => {
      const next = Math.max(0, this.remainingSeconds() - 1);
      this.remainingSeconds.set(next);
      if (next === 0) this.expireQr();
    }, 1000);
  }
  private expireQr(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = undefined;
    this.checkQr(() => {
      this.qrUrl.set(undefined);
      this.expired.set(true);
      this.busy.set(true);
      this.viewState.set('waiting_qr');
      this.beginPolling();
    });
  }
  private beginPolling(): void {
    if (!this.qrPollTimer) this.qrPollTimer = setInterval(() => this.checkQr(), 4000);
  }
  private stopPolling(): void {
    if (this.qrPollTimer) clearInterval(this.qrPollTimer);
    this.qrPollTimer = undefined;
  }
  private armFallback(): void {
    if (this.fallbackTimer) return;
    this.fallbackTimer = setTimeout(() => {
      if (!this.qrUrl() && !this.linked()) this.fallbackVisible.set(true);
      this.fallbackTimer = undefined;
    }, 12000);
  }
  private completePairing(): void {
    this.clearTimers();
    this.state.set('CONNECTED');
    this.viewState.set('connected');
    this.linked.set(true);
    this.busy.set(false);
    this.qrUrl.set(undefined);
    this.redirectTimer = setTimeout(
      () => this.router.navigateByUrl('/dashboard', { replaceUrl: true }),
      750,
    );
  }
  private fail(message: string): void {
    this.busy.set(false);
    this.state.set('ERROR');
    this.viewState.set('error');
    this.error.set(message);
    this.fallbackVisible.set(true);
  }
  private clearTimers(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.qrPollTimer) clearInterval(this.qrPollTimer);
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    if (this.redirectTimer) clearTimeout(this.redirectTimer);
    this.countdownTimer = undefined;
    this.qrPollTimer = undefined;
    this.fallbackTimer = undefined;
    this.redirectTimer = undefined;
  }
}
