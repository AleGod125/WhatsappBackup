import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnChanges,
  SimpleChanges,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Chat, Media, Message, MessageCursor, RecheckJob } from '../../../core/models/api.models';
import { MessageService } from '../../../core/services/message.service';
import { HistoryProgressService } from './history-progress';
import { AvatarComponent } from '../../../shared/components/avatar.component';
import { MessageListComponent } from '../message-list/message-list.component';
import { MediaViewerComponent } from '../media/media-viewer.component';
import { ChatMenuComponent } from './chat-menu.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { PreferencesService } from '../../../core/services/preferences.service';
import { nombreVisible } from '../../../shared/utils/nombre-visible';
import { HistoryRecheckPanelComponent } from '../recheck/history-recheck-panel.component';
import { HistoryRecheckService } from '../../../core/services/history-recheck.service';

import { estadoDeChat } from '../chat-estado';
import { sseDebug } from '../../../core/events/sse-debug';

@Component({
  selector: 'app-conversation',
  imports: [
    DatePipe,
    AvatarComponent,
    MessageListComponent,
    MediaViewerComponent,
    HistoryRecheckPanelComponent,
    ChatMenuComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversation.component.html',
  styleUrl: './conversation.component.scss',
})
export class ConversationComponent implements OnChanges {
  private readonly prefs = inject(PreferencesService);
  private readonly i18n = inject(I18nService);

  /**
   * El nombre que se enseña: alias del usuario, nombre resuelto, o un texto
   * de espera mientras la metadata sigue llegando.
   */
  readonly nombre = computed(() =>
    nombreVisible(this.chat(), this.prefs.alias(this.chat().id), this.i18n.t()),
  );

  /** Aviso discreto tras renombrar. Lo recoge el tablero. */
  readonly aliasGuardado = output<void>();
  avisarDeGuardado(): void {
    this.aliasGuardado.emit();
  }

  /** El estado de este chat, decidido en `chat-estado` y no aquí. */
  readonly estado = computed(() => estadoDeChat(this.chat(), this.waitingForPhone()));
  /** Lo dice la cola de recuperación, no el chat. */
  waitingForPhone = input(false);

  chat = input.required<Chat>();
  private readonly messagesApi = inject(MessageService);
  private readonly historial = inject(HistoryProgressService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly recheckApi = inject(HistoryRecheckService);
  private readonly list = viewChild(MessageListComponent);
  readonly messages = signal<Message[]>([]);
  readonly loading = signal(true);
  readonly loadingOlder = signal(false);
  readonly hasMore = signal(false);
  readonly newMessages = signal(0);
  readonly viewer = signal<{ media: Media; type: Message['type'] } | undefined>(undefined);
  readonly recheckOpen = signal(false);
  readonly recheckJob = signal<RecheckJob | undefined>(undefined);
  readonly recheckError = signal<string | undefined>(undefined);
  private cursor?: MessageCursor;
  private loadToken = 0;
  ngOnChanges(changes: SimpleChanges) {
    if (changes['chat']) this.loadInitial();
  }
  loadOlder() {
    if (this.loadingOlder() || !this.hasMore() || !this.cursor) return;
    const snapshot = this.list()?.captureScroll();
    const chatId = this.chat().id;
    const generation = this.loadToken;
    this.loadingOlder.set(true);
    this.messagesApi
      .list(chatId, 200, this.cursor)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (chatId !== this.chat().id || generation !== this.loadToken) {
            this.loadingOlder.set(false);
            return;
          }
          const known = new Set(this.messages().map((m) => m.id));
          this.messages.set([...page.items.filter((m) => !known.has(m.id)), ...this.messages()]);
          this.cursor = page.nextCursor;
          this.hasMore.set(page.hasMore);
          this.loadingOlder.set(false);
          if (snapshot) this.list()?.restoreAfterPrepend(snapshot);
        },
        error: () => this.loadingOlder.set(false),
      });
  }
  append(message: Message) {
    // Los dos motivos por los que un mensaje NO entra, dichos en voz alta:
    // descartar en silencio es lo que hizo que un id entero comparado con una
    // cadena tirara todos los mensajes sin dejar rastro.
    if (message.chatId !== this.chat().id) {
      sseDebug('ignored', {
        reason: 'otra conversacion',
        llega: message.chatId,
        abierta: this.chat().id,
      });
      return;
    }
    if (this.messages().some((item) => item.id === message.id)) {
      sseDebug('ignored', { reason: 'ya estaba', id: message.id });
      return;
    }
    const follow = this.list()?.isNearBottom() ?? true;
    this.messages.update((items) => [...items, message]);
    sseDebug('appended', { id: message.id, chat: message.chatId, follow });
    if (follow) queueMicrotask(() => this.list()?.scrollToBottom(true));
    else this.newMessages.update((count) => count + 1);
  }
  update(message: Message) {
    if (message.chatId && message.chatId !== this.chat().id) return;
    this.messages.update((items) =>
      items.map((item) => (item.id === message.id ? { ...item, ...message } : item)),
    );
  }
  updateMedia(messageId: string, media: Media) {
    this.messages.update((items) =>
      items.map((item) =>
        item.id === messageId || item.media?.id === media.id ? { ...item, media } : item,
      ),
    );
  }
  showNewest() {
    this.newMessages.set(0);
    this.list()?.scrollToBottom(true);
  }
  /**
   * Vuelve a comprobar si esta conversacion ya tiene una referencia.
   *
   * Solo mira lo local: alias del contacto y datos que WhatsApp ya entrego.
   * Si aparece una referencia, el historial se descarga solo; si no, el chat
   * sigue pendiente, que es reintentable y no un fallo.
   */
  recheckHistory() {
    const chatId = Number(this.chat().id);
    if (!Number.isInteger(chatId)) return;
    this.recheckOpen.set(true);
    this.recheckJob.set(undefined);
    this.recheckError.set(undefined);
    this.recheckApi
      .recheckChat(chatId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.recheckJob.set(job);
          if (job.recovered) this.reload();
        },
        error: (error: { message: string }) => this.recheckError.set(error.message),
      });
  }
  reload() {
    this.loadInitial();
  }
  /**
   * El indicador de recuperacion, para la plantilla.
   *
   * Se expone el servicio entero en vez de copiar sus senales: copiarlas
   * obliga a mantener dos verdades sincronizadas, y la que se queda vieja es
   * siempre la copia.
   */
  readonly historialEstado = this.historial.estado;
  readonly historialVisible = this.historial.visible;
  readonly historialGirando = this.historial.girando;
  readonly historialRecuperados = this.historial.recuperados;

  /**
   * Sigue la recuperacion de esta conversacion, y trae lo que vaya entrando.
   *
   * DOS COSAS, Y LA SEGUNDA ES LA QUE IMPORTA
   * -----------------------------------------
   * 1. pide prioridad: el usuario la tiene abierta, asi que pasa delante de
   *    todo en la cola de excavacion;
   * 2. cuando entra un lote, **trae los mensajes**. Contar no basta: sin esto
   *    el indicador diria "+50" y arriba no aparecia ni uno hasta recargar.
   *
   * El prepend lo hace `loadOlder`, que ya deduplica por identificador y ya
   * preserva el viewport. No se reimplementa nada de eso aqui.
   */
  private seguirRecuperacion(chatId: string, token: number): void {
    this.historial
      .seguir(chatId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          if (token !== this.loadToken) return;
          this.historial.aplicarRespuesta(
            respuesta as { waiting_seed?: boolean; state?: string | null },
          );
        },
        // Que no se pueda priorizar no rompe la conversacion: se sigue viendo
        // lo que ya hay, que es lo que el usuario ha venido a leer.
        error: () => undefined,
      });

    this.historial.lotes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((entrante) => {
        // Un lote de OTRA conversacion no puede tocar esta lista ni su scroll.
        if (entrante !== String(this.chat().id) || token !== this.loadToken) return;
        this.loadOlder();
      });
  }

  private loadInitial() {
    const token = ++this.loadToken;
    this.messages.set([]);
    this.newMessages.set(0);
    this.loading.set(true);
    this.cursor = undefined;
    this.messagesApi
      .list(this.chat().id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (token !== this.loadToken) return;
          this.messages.set(page.items);
          this.cursor = page.nextCursor;
          this.hasMore.set(page.hasMore);
          this.loading.set(false);
          this.list()?.scrollToBottomAfterRender();
          this.seguirRecuperacion(this.chat().id, token);
        },
        error: () => {
          if (token === this.loadToken) this.loading.set(false);
        },
      });
  }
}
