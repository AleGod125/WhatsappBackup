import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AppError,
  Chat,
  Media,
  Message,
  RecheckJob,
  SyncStatus,
} from '../../core/models/api.models';
import { ChatService, normalizeChat } from '../../core/services/chat.service';
import { normalizeMedia, normalizeMessage } from '../../core/services/message.service';
import { RealtimeService } from '../../core/events/realtime.service';
import { SyncService, normalizeSyncStatus } from '../../core/services/sync.service';
import { LeftRailComponent } from './left-rail.component';
import { ChatSidebarComponent } from './chat-sidebar/chat-sidebar.component';
import { ConversationComponent } from './conversation/conversation.component';
import { StoragePanelComponent } from './storage/storage-panel.component';
import { WebCompanionPanelComponent } from './web-companion/web-companion-panel.component';
import { WebCompanionService } from '../../core/services/web-companion.service';
import { SyncIndicatorComponent } from './sync-status/sync-indicator.component';
import { ProgressToolbarComponent } from './progress-toolbar.component';
import { claveDeEstado } from './chat-estado';
import { SessionService } from '../../core/services/session.service';
import { previewFor } from '../../shared/utils/display';
import {
  HistoryRecheckService,
  normalizeRecheckJob,
} from '../../core/services/history-recheck.service';
import { HistoryRecheckPanelComponent } from './recheck/history-recheck-panel.component';
import { resumenDeSync } from './sync-resumen';
import { contar, quedaTrabajo } from './recuento';
import { SettingsPanelComponent } from '../settings/settings-panel.component';
import { PreferencesService } from '../../core/services/preferences.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    LeftRailComponent,
    ChatSidebarComponent,
    ConversationComponent,
    StoragePanelComponent,
    WebCompanionPanelComponent,
    SyncIndicatorComponent,
    ProgressToolbarComponent,
    HistoryRecheckPanelComponent,
    SettingsPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent implements OnInit {
  private readonly chatsApi = inject(ChatService);
  private readonly syncApi = inject(SyncService);
  private readonly sessionApi = inject(SessionService);
  private readonly recheckApi = inject(HistoryRecheckService);
  private readonly realtimeSvc = inject(RealtimeService);
  private readonly realtimeState = this.realtimeSvc.state;
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly webCompanionApi = inject(WebCompanionService);
  private syncPollTimer?: ReturnType<typeof setTimeout>;
  private refrescoPendiente?: ReturnType<typeof setTimeout>;
  private readonly conversation = viewChild(ConversationComponent);
  readonly chats = signal<Chat[]>([]);
  readonly selected = signal<Chat | undefined>(undefined);
  readonly loading = signal(true);
  readonly sync = signal<SyncStatus | undefined>(undefined);
  readonly disconnected = signal(false);
  readonly reconnecting = signal(false);
  /**
   * Hay que volver a vincular WhatsApp. NO es lo mismo que estar desconectado.
   *
   * "Conexion con WhatsApp perdida" se decia para las dos cosas, y el usuario
   * no tenia forma de saber si esperaba o si tenia que hacer algo. Cuando la
   * sesion ya no existe hay una sola salida, y esta pantalla la ofrece.
   */
  readonly needsRelink = signal(false);
  /**
   * En qué situación está el canal en tiempo real.
   *
   * Se enseña porque la diferencia importa: si el canal está caído, lo que hay
   * en pantalla puede estar viejo, y el usuario merece saberlo en vez de
   * quedarse mirando una lista que no se mueve.
   */
  readonly realtime = this.realtimeState;
  readonly localMode = signal(false);
  readonly syncBusy = signal(false);
  readonly toast = signal<string | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);
  readonly recheckOpen = signal(false);
  readonly recheckJob = signal<RecheckJob | undefined>(undefined);
  readonly recheckError = signal<string | undefined>(undefined);
  /** La revision de fondo, sin panel: solo alimenta el indicador lateral. */
  readonly recheckAuto = signal<RecheckJob | undefined>(undefined);
  /** Diagnostico opcional: no forma parte del flujo normal. */
  readonly webCompanionEnabled = signal(false);
  /** El cajón de recuperación avanzada. Cerrado por defecto. */
  readonly advancedOpen = signal(false);
  /** La configuración del producto: idioma, tema, tipografía. */
  readonly settingsOpen = signal(false);
  /** Con qué sección abrirla. Vacío = por el principio. */
  readonly seccionDeAjustes = signal<string>('');
  private readonly preferencias = inject(PreferencesService);
  /**
   * El teléfono dejó de responder y la recuperación está en pausa.
   *
   * Afecta a la tanda entera, así que vive aquí y no en cada chat.
   */
  readonly waitingForPhone = signal(false);
  /**
   * Cuántas conversaciones hay en cada situación.
   *
   * Por categorías y sin sumar: «recuperándose» es trabajo en curso, no un
   * fallo, y meterlo en el mismo número que «esperando referencia» hacía leer
   * 43 problemas donde había 37 conversaciones avanzando.
   */
  readonly recuento = computed(() => contar(this.chats(), this.waitingForPhone()));
  /** Sólo lo que de verdad falta por hacer. */
  readonly chatsPendientes = computed(() =>
    quedaTrabajo(this.recuento())
      ? this.recuento().recuperandose +
        this.recuento().reintentando +
        this.recuento().esperandoReferencia +
        this.recuento().error
      : 0,
  );
  /**
   * Cuántos mensajes hay guardados ya.
   *
   * Se suma de las conversaciones, que es el único sitio donde el dato existe
   * de verdad. Va como CIFRA y nunca como porcentaje: el total que llegará a
   * haber no se sabe hasta haberlo traído.
   */
  readonly mensajesGuardados = computed(() =>
    this.chats().reduce((suma, chat) => suma + (chat.messageCount ?? 0), 0),
  );
  private autoRecheckLanzado = false;
  readonly syncRunning = computed(() => this.syncBusy() || isSyncRunning(this.sync()));
  readonly syncDisabled = computed(
    () => this.localMode() || this.disconnected() || this.syncRunning(),
  );
  readonly syncTooltip = computed(() =>
    this.localMode()
      ? 'El backend está en modo local.'
      : this.disconnected()
        ? 'WhatsApp no está conectado.'
        : this.syncRunning()
          ? 'Buscando novedades...'
          : // "Sincronizar" prometía una sincronización total. El ciclo busca
            // referencias nuevas y completa lo que se pueda: eso es lo que dice.
            'Buscar novedades',
  );
  ngOnInit() {
    this.destroyRef.onDestroy(() => {
      if (this.syncPollTimer) clearTimeout(this.syncPollTimer);
      if (this.refrescoPendiente) clearTimeout(this.refrescoPendiente);
    });
    // Lo local ya se aplicó al construir el servicio; esto trae lo del
    // servidor, que es lo que manda y lo que viaja entre equipos.
    this.preferencias.cargar();
    this.loadRuntimeMode();
    this.loadChats();
    this.loadSync();
    this.loadWebCompanion();
    this.realtimeSvc.connect();
    this.realtimeSvc.connection$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((state) => {
      if (state === 'disconnected') {
        this.disconnected.set(true);
        this.reconnecting.set(true);
      } else {
        const mustReconcile = this.reconnecting();
        this.disconnected.set(false);
        this.reconnecting.set(false);
        if (mustReconcile) this.reconcileAfterReconnect();
      }
    });
    this.realtimeSvc.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.handleEvent(event.type, event.data));
  }
  /**
   * Diagnostico opcional: solo se pinta si el backend lo tiene activado.
   *
   * Un fallo aqui no puede estropear el panel: es una herramienta de medida,
   * no parte del producto.
   */
  private loadWebCompanion() {
    this.webCompanionApi
      .status()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => this.webCompanionEnabled.set(s.enabled),
        error: () => this.webCompanionEnabled.set(false),
      });
  }
  /** El botón normal: busca novedades y completa lo que se pueda. */
  /**
   * El detalle vive en los ajustes, no en la barra lateral.
   *
   * Pulsar la barra de progreso abre la sección de sincronización y
   * recuperación ya desplegada, en vez de expandir un bloque dentro de la
   * lista: la lista es lo que el usuario ha venido a ver.
   */
  abrirRecuperacion() {
    this.seccionDeAjustes.set('recovery');
    this.settingsOpen.set(true);
  }

  runSync() {
    this.lanzarSync(false);
  }

  /**
   * La revisión completa. Mismo ciclo, y además adelanta los reintentos que
   * estaban esperando turno. No borra nada — el diálogo de confirmación ya se
   * lo dijo al usuario antes de llegar aquí.
   */
  runFullRecovery() {
    this.lanzarSync(true);
  }

  /**
   * Un solo camino para los dos botones.
   *
   * Es también la protección contra el doble clic: `syncDisabled()` incluye
   * `syncRunning()`, así que la segunda pulsación no llega a salir. Y si aun
   * así llegara, el backend responde `SYNC_ALREADY_RUNNING` y se reutiliza el
   * ciclo que ya corre en vez de lanzar otro.
   */
  private lanzarSync(profundo: boolean) {
    if (this.syncDisabled()) return;
    this.syncBusy.set(true);
    this.sync.update((value) => ({ ...value, state: 'running' }));
    (profundo ? this.syncApi.fullRecovery() : this.syncApi.run())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          const status = normalizeSyncStatus(value);
          this.sync.set({ ...status, state: status.state ?? 'running' });
          this.syncBusy.set(true);
          this.scheduleSyncPoll();
        },
        error: (error: AppError) => {
          this.syncBusy.set(false);
          if (error.code === 'SYNC_ALREADY_RUNNING') {
            // No es un fallo: ya hay un ciclo trabajando. Se reutiliza.
            this.sync.update((value) => ({ ...value, state: 'running' }));
            this.showToast('Sincronización en curso.');
            this.syncBusy.set(true);
            this.scheduleSyncPoll();
            return;
          }
          if (error.code === 'WHATSAPP_DISABLED') this.showToast('El backend está en modo local.');
          else if (error.code === 'SESSION_NOT_CONNECTED')
            this.showToast('WhatsApp no está conectado.');
          else this.showToast(error.message);
        },
      });
  }
  /**
   * Revisa los historiales pendientes con lo que ya tenemos en casa.
   *
   * No vincula ningun dispositivo ni pide un segundo QR: resuelve alias y
   * reinterpreta los datos que WhatsApp ya entrego. El progreso llega por SSE.
   */
  recheckPendingHistories() {
    this.recheckOpen.set(true);
    this.recheckJob.set(undefined);
    this.recheckError.set(undefined);
    this.recheckApi
      .recheckPending()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => this.recheckJob.set(job),
        error: (error: AppError) => {
          // Ya hay una en marcha: no es un fallo, hay que engancharse a esa.
          if (error.code === 'RECHECK_BUSY') return;
          this.recheckError.set(error.message);
        },
      });
  }
  /**
   * Intenta una extraccion al abrir el panel, y en cada refresco.
   *
   * Silenciosa a proposito: sin modal ni interrupcion. Si aparece un ancla, el
   * historial se descarga solo y los mensajes van llegando por SSE; si no, no
   * ha pasado nada que contarle al usuario.
   *
   * Solo una vez por carga de pagina, y solo con WhatsApp conectado y algo
   * pendiente. La espera entre ejecuciones la aplica el backend, que es quien
   * sabe cuando corrio la ultima.
   */
  private maybeAutoRecheck(status: SyncStatus) {
    if (this.autoRecheckLanzado) return;
    if (status.connected === false || !(status.waitingSeed ?? 0)) return;
    this.autoRecheckLanzado = true;
    this.recheckApi
      .recheckPending({ auto: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => this.recheckAuto.set(job),
        // Silenciosa tambien al fallar: el usuario no pidio esto y tiene el
        // boton para hacerlo a mano si le interesa.
        error: () => undefined,
      });
  }
  recheckCompleted() {
    this.loadSync();
    this.loadChats();
  }
  select(chat: Chat) {
    this.selected.set(chat);
    this.router.navigate(['/dashboard', chat.id]);
    this.chatsApi
      .get(chat.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          if (this.selected()?.id === chat.id) this.selected.set(mergeDefined(chat, detail));
        },
      });
  }
  /**
   * Vuelve a la lista. En móvil la conversación ocupa toda la pantalla y sin
   * esto no hay salida; en escritorio el botón ni se ve.
   */
  deselect() {
    this.selected.set(undefined);
    this.router.navigate(['/dashboard']);
  }

  /** Reintento manual desde el sidebar. */
  reloadChats(): void {
    this.error.set(undefined);
    this.loadChats();
  }

  /**
   * @param silencioso no enciende el indicador de carga.
   *
   * Una recarga por un aviso de fondo no puede parpadear la lista entera: el
   * usuario no ha pedido nada y lo único que ve es que todo desaparece y
   * vuelve.
   */
  private loadChats(opciones: { silencioso?: boolean } = {}) {
    if (!opciones.silencioso) this.loading.set(true);
    this.error.set(undefined);
    this.chatsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (chats) => {
          this.chats.set(chats);
          this.loading.set(false);
          // En una recarga de fondo el chat abierto ya está elegido: volver a
          // seleccionarlo reiniciaría su scroll a mitad de lectura.
          if (opciones.silencioso) return;
          const id =
            this.route.snapshot.paramMap.get('chatId') ??
            this.route.snapshot.queryParamMap.get('chat');
          if (id) {
            const chat = chats.find((item) => item.id === id);
            if (chat) this.select(chat);
          }
        },
        error: () => {
          // Un fallo en una recarga de fondo no borra lo que ya se ve.
          if (!opciones.silencioso) {
            this.error.set('No fue posible cargar las conversaciones.');
          }
          this.loading.set(false);
        },
      });
  }
  private reconcileAfterReconnect() {
    const selectedId = this.selected()?.id;
    this.chatsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (chats) => {
          this.chats.set(chats);
          if (!selectedId) return;
          this.chatsApi
            .get(selectedId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (detail) => {
                if (this.selected()?.id === selectedId) {
                  this.selected.update((current) => mergeDefined(current, detail));
                  this.conversation()?.reload();
                }
              },
            });
        },
      });
  }
  private loadSync() {
    this.syncApi
      .status()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          const previous = this.sync();
          this.sync.set(value);
          this.syncBusy.set(isSyncRunning(value));
          if (value.connected === false) this.disconnected.set(true);
          this.maybeAutoRecheck(value);
          if (isSyncRunning(value)) this.scheduleSyncPoll();
          else if (isSyncRunning(previous) && isSyncComplete(value))
            this.showToast(resumenDeSync(value));
        },
      });
  }
  /** Solo para la prueba: el texto se construye fuera del componente. */
  readonly syncSummaryText = computed(() => resumenDeSync(this.sync()));
  /** La unica salida cuando el vinculo ya no existe. */
  irAVincular() {
    this.router.navigate(['/pairing']);
  }
  private scheduleSyncPoll() {
    if (this.syncPollTimer) clearTimeout(this.syncPollTimer);
    this.syncPollTimer = setTimeout(() => {
      this.syncPollTimer = undefined;
      this.loadSync();
    }, 1200);
  }
  private loadRuntimeMode() {
    this.sessionApi
      .health()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (health) => {
          this.localMode.set(!health.whatsappEnabled);
          this.sessionApi
            .getSession()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (session) => {
                this.disconnected.set(!session.connected);
                this.needsRelink.set(hayQueVolverAVincular(session.state, session.connected));
              },
            });
        },
      });
  }
  private handleEvent(type: string, data: unknown) {
    // El teléfono dejó de responder: la recuperación se pausó sola y no se ha
    // perdido nada. Es un aviso, no un error, y afecta a la tanda entera.
    if (type === 'history.waiting_for_phone') {
      this.waitingForPhone.set(true);
      this.showToast('Abre WhatsApp en tu teléfono para continuar.');
      return;
    }
    if (type === 'history.recovery_resumed') {
      this.waitingForPhone.set(false);
      return;
    }
    if (type === 'session.state' && data && typeof data === 'object') {
      const raw = data as Record<string, unknown>;
      const state = String(raw['state'] ?? raw['status'] ?? '').toUpperCase();
      if (state === 'SESSION_INVALID') this.router.navigate(['/pairing']);
      if (state === 'CONNECTED') this.disconnected.set(false);
      else if (state !== 'CONNECTING') this.disconnected.set(true);
      // Y se distingue el corte pasajero del vinculo que ya no existe: son
      // dos mensajes distintos y dos salidas distintas para el usuario.
      this.needsRelink.set(hayQueVolverAVincular(state, state === 'CONNECTED'));
    }
    if (type === 'sync.status' && data && typeof data === 'object') {
      const previous = this.sync();
      const current = normalizeSyncStatus(unwrap(data, 'sync'));
      this.sync.set(current);
      this.syncBusy.set(false);
      if (current.connected === false) this.disconnected.set(true);
      if (isSyncRunning(previous) && isSyncComplete(current))
        this.showToast(resumenDeSync(current));
    }
    if (type.startsWith('history.recheck.') && data && typeof data === 'object') {
      const job = normalizeRecheckJob(data as Record<string, unknown>);
      this.recheckAuto.set(job);
      // Al terminar, lo que haya despertado ya esta excavandose: se recargan
      // los chats para que el usuario vea los contadores nuevos.
      if (type === 'history.recheck.completed' && job.recovered > 0) {
        this.loadChats();
        this.loadSync();
      }
    }
    if (type === 'history.backfill.completed') this.loadSync();

    // Un chat cambió de estado. Se actualiza EN SITIO, sin recargar la lista:
    // durante una excavación esto llega cada pocos segundos.
    if (type === 'chat.status' && data && typeof data === 'object') {
      const raw = data as Record<string, unknown>;
      const jid = String(raw['chat_jid'] ?? '');
      const chatId = typeof raw['chat_id'] === 'number' ? String(raw['chat_id']) : undefined;
      const estado = String(raw['history_status'] ?? '');
      // Por identificador si viene: una conversación que llegó por LID puede
      // estar en la lista con el JID del teléfono, y comparar cadenas fallaría.
      if (estado && (jid || chatId)) this.aplicarEstado(jid, estado, chatId);
    }

    // El índice de WhatsApp Web terminó: puede haber conversaciones nuevas
    // que aquí no existían. Esas sí obligan a pedir la lista, pero una vez.
    if (type === 'chat.inventory' && data && typeof data === 'object') {
      const raw = data as Record<string, unknown>;
      const nuevos = typeof raw['web_inventory_new'] === 'number' ? raw['web_inventory_new'] : 0;
      const promovidos = typeof raw['chats_promoted'] === 'number' ? raw['chats_promoted'] : 0;
      // Red de seguridad, no el camino normal: cada conversación ya llegó
      // por su cuenta con `chat.created`. Esto sólo cubre el caso de que un
      // aviso se perdiera, y va con freno para no repetir la petición.
      if (nuevos > 0 || promovidos > 0) this.refrescarListaPronto();
      if (nuevos > 0) {
        this.showToast(
          nuevos === 1
            ? 'Se encontró 1 conversación nueva.'
            : `Se encontraron ${nuevos} conversaciones nuevas.`,
        );
      }
    }

    // Entraron mensajes de historial. El backend dice EN QUÉ chats, así que
    // no hace falta reconstruir la lista entera.
    if (type === 'history.progress' && data && typeof data === 'object') {
      const raw = data as Record<string, unknown>;
      const jids = Array.isArray(raw['chat_jids']) ? (raw['chat_jids'] as string[]) : [];
      const abierto = this.selected();
      // Si el chat abierto recibió mensajes, se recarga su conversación: es
      // lo que el usuario está mirando ahora mismo. No se espera al final de
      // la excavación: lo ya guardado se puede leer mientras llega el resto.
      if (abierto?.jid && jids.includes(abierto.jid)) this.conversation()?.reload();

      // El backend manda las filas ya resueltas cuando son pocas. Con ellas
      // no hace falta pedir nada: contador, previa y estado se actualizan en
      // el sitio. Una excavación de tres mil mensajes son sesenta avisos.
      const filas = Array.isArray(raw['chats']) ? (raw['chats'] as unknown[]) : [];
      if (filas.length) {
        for (const fila of filas) {
          const chat = normalizeChat(fila as Record<string, unknown>);
          if (chat.id) this.upsertChat(chat);
        }
      } else if (jids.length) {
        // Sin filas —demasiadas para caber en el aviso— se pide la lista una
        // sola vez, con freno.
        this.refrescarListaPronto();
      }
    }
    // Una conversación que aquí no existía. Viene con su fila entera, así
    // que se inserta y ya está: pedir la lista por cada una convertiría
    // cincuenta descubrimientos en cincuenta peticiones.
    if (type === 'chat.created' || type === 'chat.updated') {
      const chat = normalizeChat(unwrap(data, 'chat'));
      if (chat.id) this.upsertChat(chat);
    }
    if (type === 'message.created') {
      const message = normalizeMessage(unwrap(data, 'message'));
      this.conversation()?.append(message);
      const current = this.chats().find((c) => c.id === message.chatId);
      if (current)
        this.upsertChat({
          ...current,
          // La etiqueta la manda el backend ya resuelta; aqui solo se
          // recurre al mapa local si no vino ninguna.
          preview: message.preview ?? previewFor(message.type, message.text),
          lastMessageAt: message.timestamp,
        });
    }
    if (type === 'message.updated')
      this.conversation()?.update(normalizeMessage(unwrap(data, 'message')));
    if (type === 'media.updated' && data && typeof data === 'object') {
      const raw = data as Record<string, unknown>;
      const mediaRaw = (
        raw['media'] && typeof raw['media'] === 'object' ? raw['media'] : raw
      ) as Record<string, unknown>;
      const messageId = String(
        raw['message_id'] ??
          raw['messageId'] ??
          mediaRaw['message_id'] ??
          mediaRaw['messageId'] ??
          '',
      );
      this.conversation()?.updateMedia(messageId, normalizeMedia(mediaRaw));
    }
  }
  /**
   * Cambia el estado de un chat sin ir al servidor.
   *
   * Llega uno por cada transición y por cada chat de la tanda; pedir la lista
   * entera en cada uno convertiría una excavación de cuarenta chats en
   * cuarenta peticiones.
   */
  private aplicarEstado(jid: string, historyStatus: string, chatId?: string) {
    const status = historyStatus as Chat['historyStatus'];
    const esEste = (item: Chat) => (chatId ? item.id === chatId : false) || item.jid === jid;
    this.chats.update((items) =>
      items.map((item) =>
        esEste(item)
          ? { ...item, historyStatus: status, waitingSeed: status === 'waiting_seed' }
          : item,
      ),
    );
    const abierto = this.selected();
    if (abierto && esEste(abierto)) {
      this.selected.set({
        ...abierto,
        historyStatus: status,
        waitingSeed: status === 'waiting_seed',
      });
    }
  }

  /**
   * Una sola recarga de la lista, por muchos avisos que lleguen.
   *
   * Una excavación produce un aviso por cada bloque de cincuenta mensajes.
   * Sin esto, recuperar tres mil mensajes disparaba sesenta peticiones
   * seguidas contra la misma lista.
   */
  private refrescarListaPronto() {
    if (this.refrescoPendiente) return;
    this.refrescoPendiente = setTimeout(() => {
      this.refrescoPendiente = undefined;
      this.loadChats({ silencioso: true });
    }, 800);
  }

  private upsertChat(chat: Chat) {
    this.chats.update((items) => {
      const previous = items.find((item) => item.id === chat.id);
      const merged = mergeDefined(previous, chat);
      return [merged, ...items.filter((item) => item.id !== chat.id)].sort(
        (a, b) =>
          (b.lastMessageTimestamp ?? Date.parse(b.lastMessageAt ?? '') ?? 0) -
          (a.lastMessageTimestamp ?? Date.parse(a.lastMessageAt ?? '') ?? 0),
      );
    });
    if (this.selected()?.id === chat.id) this.selected.update((value) => mergeDefined(value, chat));
  }
  private showToast(message: string) {
    this.toast.set(message);
    setTimeout(() => this.toast.set(undefined), 3500);
  }
}
function isSyncRunning(value?: SyncStatus) {
  return value?.state !== undefined ? value.state === 'running' : value?.history === 'syncing';
}
function isSyncComplete(value?: SyncStatus) {
  return value?.state === 'complete' || value?.history === 'complete';
}
function mergeDefined<T extends object>(base: T | undefined, patch: T): T {
  return Object.fromEntries(
    Object.entries({ ...base, ...patch }).filter(([, value]) => value !== undefined),
  ) as T;
}
function unwrap(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const root = value as Record<string, unknown>;
  return root[key] && typeof root[key] === 'object' ? (root[key] as Record<string, unknown>) : root;
}

/**
 * Si el estado de la sesion significa "hay que volver a vincular".
 *
 * Reconectando, conectando o arrancando NO cuentan: ahi las credenciales
 * siguen valiendo y el runtime esta volviendo solo. Mandar al usuario al
 * codigo QR en ese caso le hace rehacer algo que no esta roto.
 */
export function hayQueVolverAVincular(estado: string | undefined, conectado: boolean): boolean {
  if (conectado) return false;
  return ['NO_SESSION', 'PAIRING_REQUIRED', 'PAIRING', 'QR_READY', 'SESSION_INVALID'].includes(
    String(estado ?? ''),
  );
}
