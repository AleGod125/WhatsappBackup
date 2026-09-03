import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RealtimeService } from '../../../core/events/realtime.service';
import { Chat, WebBootstrapState } from '../../../core/models/api.models';
import { WebBootstrapService } from '../../../core/services/web-bootstrap.service';

@Component({
  selector: 'app-history-recovery-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './history-recovery-panel.component.html',
  styleUrl: './history-recovery-panel.component.scss',
})
export class HistoryRecoveryPanelComponent implements OnInit {
  private readonly realtime = inject(RealtimeService);
  private readonly api = inject(WebBootstrapService);
  private readonly destroyRef = inject(DestroyRef);
  chat = input<Chat>();
  initialState = input<WebBootstrapState>('starting');
  initialError = input<string>();
  initialQrRequired = input(false);
  close = output<void>();
  completed = output<void>();
  readonly state = signal<WebBootstrapState>('starting');
  readonly error = signal<string | undefined>(undefined);
  readonly qrUrl = signal<string | undefined>(undefined);
  readonly label = computed(() => recoveryLabel(this.state()));
  readonly title = computed(() => this.chat()?.displayName ?? 'Historiales pendientes');

  constructor() {
    effect(() => {
      this.state.set(this.initialState());
      this.error.set(this.initialError());
      if (this.initialQrRequired()) this.showAuxiliaryQr();
    });
  }

  ngOnInit(): void {
    this.realtime.connect();
    this.realtime.events$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (!RECOVERY_EVENTS.has(event.type)) return;
      const data =
        event.data && typeof event.data === 'object' ? (event.data as Record<string, unknown>) : {};
      const eventChatId = data['chat_id'] ?? data['chatId'];
      if (this.chat() && eventChatId !== undefined && String(eventChatId) !== this.chat()?.id)
        return;
      const state = stateFromEvent(event.type, data);
      this.state.set(state);
      if (state === 'qr_required' || data['qr_required'] === true || data['requires_qr'] === true)
        this.showAuxiliaryQr();
      if (typeof (data['message'] ?? data['error']) === 'string')
        this.error.set(String(data['message'] ?? data['error']));
      if (state === 'completed') this.completed.emit();
    });
  }
  onQrError(): void {
    this.qrUrl.set(undefined);
    this.error.set('El QR auxiliar todavía no está disponible.');
  }
  private showAuxiliaryQr(): void {
    this.qrUrl.set(this.api.qrUrl());
  }
}

const RECOVERY_EVENTS = new Set([
  'history.recovery.started',
  'history.recovery.progress',
  'history.recovery.completed',
  'history.seed.found',
  'history.seed.not_found',
  'history.backfill.started',
]);

export function stateFromEvent(type: string, data: Record<string, unknown>): WebBootstrapState {
  const explicit = String(data['state'] ?? data['status'] ?? '').toLowerCase();
  if (explicit) return explicit as WebBootstrapState;
  return {
    'history.recovery.started': 'starting',
    'history.recovery.progress': 'searching_chat',
    'history.recovery.completed': 'completed',
    'history.seed.found': 'seed_found',
    'history.seed.not_found': 'failed',
    'history.backfill.started': 'backfill_pending',
  }[type] as WebBootstrapState;
}

export function recoveryLabel(state: WebBootstrapState): string {
  return {
    inactive: 'Recuperador auxiliar inactivo',
    starting: 'Preparando recuperación...',
    qr_required: 'Vincula el recuperador auxiliar',
    connecting: 'Conectando...',
    searching_chat: 'Buscando una referencia reciente...',
    seed_found: 'Referencia encontrada',
    seed_validated: 'Referencia validada',
    seed_emitted: 'Preparando recuperación profunda...',
    backfill_pending: 'Recuperando historial...',
    completed: 'Historial recuperado',
    failed: 'No se pudo recuperar el historial',
  }[state];
}
