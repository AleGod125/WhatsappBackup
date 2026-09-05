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
import { Chat, RecheckJob } from '../../../core/models/api.models';
import { normalizeRecheckJob } from '../../../core/services/history-recheck.service';

/**
 * Progreso de la revision de historiales pendientes.
 *
 * Solo muestra. No arranca nada: quien lanza la revision es el boton que abre
 * este panel, y el progreso llega por SSE (`history.recheck.*`).
 *
 * Un detalle de redaccion que no es cosmetico: "sigue pendiente" NO se pinta
 * como fallo. Que WhatsApp no haya entregado todavia una referencia para una
 * conversacion es normal y reintentable; en rojo, el usuario cree que se ha
 * roto algo que no se ha roto.
 */
@Component({
  selector: 'app-history-recheck-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './history-recheck-panel.component.html',
  styleUrl: './history-recheck-panel.component.scss',
})
export class HistoryRecheckPanelComponent implements OnInit {
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  chat = input<Chat>();
  job = input<RecheckJob | undefined>(undefined);
  initialError = input<string>();
  close = output<void>();
  completed = output<void>();

  readonly current = signal<RecheckJob | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);

  readonly title = computed(() => this.chat()?.displayName ?? 'Historiales pendientes');
  readonly label = computed(() => recheckLabel(this.current()));
  readonly percent = computed(() => {
    const job = this.current();
    if (!job || !job.total) return 0;
    return Math.round((job.processed / job.total) * 100);
  });
  readonly done = computed(() => this.current()?.state === 'completed');
  readonly failed = computed(() => this.current()?.state === 'failed');

  constructor() {
    effect(() => {
      const job = this.job();
      if (job) this.current.set(job);
      const error = this.initialError();
      if (error) this.error.set(error);
    });
  }

  ngOnInit(): void {
    this.realtime.connect();
    this.realtime.events$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (!RECHECK_EVENTS.has(event.type)) return;
      const data =
        event.data && typeof event.data === 'object' ? (event.data as Record<string, unknown>) : {};
      // El backend manda el trabajo entero en cada evento, asi que el panel
      // puede redibujarse sin llevar contabilidad propia.
      if (data['job_id'] !== undefined) {
        const job = normalizeRecheckJob(data);
        this.current.set(job);
        if (job.error) this.error.set(job.error);
      }
      if (event.type === 'history.recheck.completed') this.completed.emit();
    });
  }
}

const RECHECK_EVENTS = new Set([
  'history.recheck.started',
  'history.recheck.progress',
  'history.recheck.completed',
]);

export function recheckLabel(job?: RecheckJob): string {
  if (!job) return 'Preparando revisión…';
  if (job.state === 'failed') return 'No se pudo completar la revisión';
  if (job.state !== 'completed') {
    const nombre = job.currentChat?.name;
    return nombre ? `Revisando ${nombre}…` : 'Revisando conversaciones…';
  }
  if (job.total === 0) return 'No hay conversaciones pendientes';
  if (job.recovered > 0)
    return `${job.recovered} ${job.recovered === 1 ? 'conversación recuperada' : 'conversaciones recuperadas'}`;
  return 'No apareció ninguna referencia nueva';
}
