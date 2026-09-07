import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { PreferencesService } from '../../../core/services/preferences.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { nombreVisible, textoBuscable } from '../../../shared/utils/nombre-visible';
import { Chat } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar.component';
import { HeaderMenuComponent } from '../header-menu.component';
import { previewFor } from '../../../shared/utils/display';
import { estadoDeChat, lineaDeLista } from '../chat-estado';

@Component({
  selector: 'app-chat-sidebar',
  imports: [ScrollingModule, FormsModule, DatePipe, AvatarComponent, HeaderMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-sidebar.component.html',
  styleUrl: './chat-sidebar.component.scss',
})
export class ChatSidebarComponent {
  private readonly prefs = inject(PreferencesService);
  private readonly i18n = inject(I18nService);
  chats = input.required<Chat[]>();
  selectedId = input<string>();
  loading = input(false);
  /** Para no ofrecer «Sincronizar» mientras ya se esta sincronizando. */
  sincronizando = input(false);
  /** El menu pide sincronizar; quien sabe hacerlo es el panel. */
  readonly sincronizar = output<void>();
  /** Mensaje si la carga fallo. Se distingue de la lista vacia. */
  error = input<string | undefined>(undefined);
  retry = output<void>();
  /** Lo dice la cola de recuperación: afecta a todos los chats a la vez. */
  waitingForPhone = input(false);
  chatSelected = output<Chat>();
  readonly query = signal('');
  readonly debouncedQuery = signal('');
  private timer?: ReturnType<typeof setTimeout>;
  readonly filtered = computed(() => {
    const q = this.debouncedQuery().trim().toLocaleLowerCase();
    // Se busca TAMBIÉN por el alias: si alguien renombró un chat a «Primo
    // Juan», buscar «primo» tiene que encontrarlo — es el nombre por el que
    // lo conoce. El original se conserva porque también puede buscar por él.
    return q
      ? this.chats().filter((c) => textoBuscable(c, this.prefs.alias(c.id)).includes(q))
      : this.chats();
  });

  /** El nombre que se pinta: alias, nombre resuelto, o texto de espera. */
  nombreDe(chat: Chat) {
    return nombreVisible(chat, this.prefs.alias(chat.id), this.i18n.t());
  }
  updateSearch(value: string) {
    this.query.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.debouncedQuery.set(value), 300);
  }
  select(chat: Chat) {
    this.chatSelected.emit(chat);
  }
  trackById = (_: number, chat: Chat) => chat.id;
  /**
   * La línea bajo el nombre. La decide `chat-estado`, no este componente.
   *
   * Antes cada pantalla tenía su propia tabla de estados y la misma
   * conversación podía leerse de dos formas contradictorias según dónde se
   * mirara.
   */
  preview(chat: Chat) {
    return lineaDeLista(chat, this.waitingForPhone());
  }

  /** Para poner un punto de color, no para repetir el texto. */
  estado(chat: Chat) {
    return estadoDeChat(chat, this.waitingForPhone());
  }
}
