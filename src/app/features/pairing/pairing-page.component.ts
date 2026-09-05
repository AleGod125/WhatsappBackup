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
import { interval, switchMap } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AppError,
  OnboardingStep,
  PairingPhase,
  QrStatus,
  SessionState,
  SessionStateCode,
} from '../../core/models/api.models';
import { RealtimeService } from '../../core/events/realtime.service';
import { AuthService } from '../../core/services/auth.service';
import { rutaPara } from '../../core/guards/onboarding.guard';
import { SessionService, normalizeSession } from '../../core/services/session.service';

/** Cada cuánto se pregunta si ya se puede salir. Respaldo del SSE. */
const SONDEO_ONBOARDING_MS = 2500;

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
  private readonly auth = inject(AuthService);
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
  /** Para no navegar dos veces si el SSE y el sondeo coinciden. */
  private saliendo = false;

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
  readonly phase = signal<PairingPhase | undefined>(undefined);
  readonly rejections = signal<{ n: number; max: number } | undefined>(undefined);
  readonly countdown = computed(() => {
    const seconds = this.remainingSeconds();
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });
  readonly title = computed(() => {
    if (this.linked()) return 'Cuenta vinculada';
    if (this.qrUrl()) return 'Escanea el código QR';
    if (this.error()) return 'No pudimos preparar el código';
    // Mientras el servidor decide si la vinculación guardada sigue viva no se
    // está preparando ningún código: decirlo sería mentir, y el usuario espera
    // sin saber que algo avanza.
    if (this.phase() === 'verifying_session') return 'Verificando sesión anterior';
    if (this.phase() === 'connecting') return 'Conectando con WhatsApp';
    return 'Generando código QR';
  });
  readonly status = computed(() => {
    if (this.linked()) return 'Conexión confirmada. Abriendo tus conversaciones…';
    if (this.error()) return 'Puedes volver a intentarlo sin perder información.';
    if (this.expired()) return 'El código venció. Estamos generando uno nuevo…';
    if (this.qrUrl()) return 'Esperando confirmación desde tu teléfono';
    if (this.phase() === 'verifying_session') {
      const r = this.rejections();
      const cuenta = r && r.max ? ` (intento ${Math.max(1, r.n)} de ${r.max})` : '';
      return (
        `Comprobando si la vinculación guardada sigue activa${cuenta}. ` +
        'Si el teléfono la rechaza, se archivará y pediremos un código nuevo.'
      );
    }
    return 'Conectando de forma segura con WhatsApp…';
  });

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

    // Se pregunta ANTES de tocar nada. Si esta cuenta ya tiene WhatsApp
    // vinculado, entrar aquí y pedir otra vinculación intentaría arrancar una
    // sesión sobre una que ya funciona: recargar /pairing no puede tener ese
    // efecto.
    this.auth
      .onboarding()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (estado) => {
          if (estado.nextStep !== 'pairing') {
            this.router.navigateByUrl(rutaPara(estado.nextStep));
            return;
          }
          this.arrancarVinculacion();
          this.vigilarOnboarding();
        },
        // Sin poder preguntar se sigue con el camino normal: es mejor
        // intentarlo que dejar la pantalla en blanco.
        error: () => {
          this.arrancarVinculacion();
          this.vigilarOnboarding();
        },
      });
  }

  /**
   * Comprueba periódicamente si ya se puede salir de aquí.
   *
   * El SSE es la vía rápida, pero no puede ser la única: un evento se pierde
   * si el navegador durmió, si el stream reconectó, o si llegó antes de que
   * este componente se suscribiera. Sin este respaldo, la pantalla se queda
   * diciendo "Abriendo tus conversaciones…" para siempre — que es exactamente
   * lo que pasó.
   */
  private vigilarOnboarding(): void {
    interval(SONDEO_ONBOARDING_MS)
      .pipe(
        switchMap(() => this.auth.onboarding()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (estado) => {
          if (estado.nextStep !== 'pairing') this.salir(estado.nextStep);
        },
        error: () => undefined,
      });
  }

  /** Navega al paso que diga el backend. Una sola vez. */
  private salir(paso: OnboardingStep): void {
    if (this.saliendo) return;
    this.saliendo = true;
    this.clearTimers();
    this.router.navigateByUrl(rutaPara(paso));
  }

  private arrancarVinculacion(): void {
    this.session
      .getSession()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.state.set(value.state);
          this.phase.set(value.pairingPhase);
          if (value.sessionRejections !== undefined)
            this.rejections.set({
              n: value.sessionRejections,
              max: value.sessionRejectionsMax ?? 3,
            });
          if (value.connected) {
            this.completePairing();
            return;
          }
          if (value.whatsappEnabled === false) {
            this.fail('El backend está en modo local. La vinculación no está disponible.');
            return;
          }
          this.viewState.set('waiting_qr');
          // El backend ya NO genera un QR al arrancar: una vinculación sin
          // dueño acabaría en manos del primero que pase. Hay que pedirla,
          // y el servidor la asocia al usuario de la cookie.
          this.checkQr(() => this.beginPairing());
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
    this.phase.set(value.pairingPhase);
    if (value.sessionRejections !== undefined)
      this.rejections.set({
        n: value.sessionRejections,
        max: value.sessionRejectionsMax ?? 3,
      });
    if (value.connected) {
      this.completePairing();
      return;
    }
    if (this.viewState() === 'qr_ready' && this.qrUrl()) return;
    this.viewState.set(value.state === 'CONNECTING' ? 'connecting' : 'waiting_qr');
    this.busy.set(true);
    // Aquí NO se pide el QR.
    //
    // `session.state` llega muchas veces seguidas mientras el servidor
    // reintenta una sesión revocada (un evento por rechazo, más los cambios de
    // generación). Pedir el QR en cada uno añadía una petición extra por
    // evento, encima del sondeo, y era lo que producía la ráfaga de
    // `GET /session/qr`. El sondeo, que ya corre cada 4 s, lo trae igual.
    this.beginPolling();
    this.armFallback();
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
          const fallo = error.code;
          // Estos dos NO son fallos de la vinculación: es que falta un paso
          // antes. Mandarlos al mensaje de error dejaría al usuario mirando
          // "no pudimos preparar el código" sin decirle qué hacer.
          if (fallo === 'DRIVE_NOT_AUTHORIZED' || error.status === 403) {
            this.router.navigateByUrl('/connect-google');
            return;
          }
          if (error.status === 401) {
            this.router.navigateByUrl('/login');
            return;
          }
          if (fallo === 'ACCOUNT_RUNTIME_IN_USE') {
            this.fail(
              'Este dispositivo tiene una vinculación de WhatsApp en marcha de otro usuario.',
            );
            return;
          }
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

    // Se CONFIRMA con el backend antes de navegar. Que el socket diga
    // CONNECTED no significa todavía que la cuenta conste vinculada, y
    // entrar al panel un instante antes muestra un panel vacío.
    //
    // La espera corta es solo para que se vea la confirmación; lo que decide
    // es la respuesta, no el reloj.
    this.redirectTimer = setTimeout(() => {
      this.auth
        .onboarding()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (estado) => this.salir(estado.nextStep),
          // Si no se puede preguntar, se va al panel igual: el guard de esa
          // ruta volverá a comprobarlo y redirigirá si hace falta.
          error: () => this.salir('dashboard'),
        });
    }, 400);
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
