import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { AppIconComponent } from '../../../shared/components/app-icon.component';
import { I18nService } from '../../../core/i18n/i18n.service';
import { PreferencesService } from '../../../core/services/preferences.service';
import { Chat } from '../../../core/models/api.models';
import { nombreVisible } from '../../../shared/utils/nombre-visible';

/**
 * El menú de la conversación, y el cambio de nombre.
 *
 * POR QUE EXISTE
 * --------------
 * En la cabecera había dos botones `disabled` —una lupa y tres puntos— que no
 * hacían nada. Un botón que no funciona es peor que no tenerlo: el usuario lo
 * pulsa, no pasa nada, y a partir de ahí desconfía del resto.
 *
 * EL NOMBRE PERSONALIZADO
 * -----------------------
 * WhatsApp puede no traer nombre nunca —se midió: `chats.name` a `NULL` en las
 * 51 conversaciones— y aun así el usuario sabe quién es. Poder escribirlo es
 * la diferencia entre una lista de teléfonos y una lista de personas.
 *
 * No sobrescribe nada: el alias vive en las preferencias del usuario, y
 * «usar el nombre original» es quitarlo, no recuperar algo perdido.
 */
@Component({
  selector: 'app-chat-menu',
  standalone: true,
  imports: [TranslatePipe, AppIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="disparador"
      [attr.aria-label]="'chat.moreOptions' | t"
      [attr.aria-expanded]="abierto()"
      [title]="'chat.moreOptions' | t"
      (click)="alternar()"
    >
      <app-icon name="more" />
    </button>

    @if (abierto()) {
      <div class="velo" (click)="cerrar()"></div>
      <div class="menu" role="menu">
        @if (editando()) {
          <div class="editor">
            <label [attr.for]="'alias-' + chat().id">{{ 'chat.rename' | t }}</label>
            <input
              [id]="'alias-' + chat().id"
              type="text"
              [value]="borrador()"
              [placeholder]="'chat.aliasPlaceholder' | t"
              (input)="borrador.set($any($event.target).value)"
              (keydown.enter)="guardar()"
              (keydown.escape)="editando.set(false)"
            />
            <small>{{ 'chat.renameHint' | t }}</small>
            <div class="acciones">
              <button type="button" class="secundario" (click)="editando.set(false)">
                {{ 'common.cancel' | t }}
              </button>
              <button type="button" class="primario" (click)="guardar()">
                {{ 'common.save' | t }}
              </button>
            </div>
          </div>
        } @else {
          <button type="button" role="menuitem" (click)="empezarAEditar()">
            <app-icon name="edit" />
            {{ 'chat.rename' | t }}
          </button>
          @if (tieneAlias()) {
            <button type="button" role="menuitem" (click)="quitarAlias()">
              <app-icon name="chevron" />
              {{ 'chat.useOriginal' | t }}
            </button>
          }
          <button type="button" role="menuitem" (click)="informacion.emit()">
            <app-icon name="document" />
            {{ 'chat.info' | t }}
          </button>
        }
      </div>
    }
  `,
  styleUrl: './chat-menu.component.scss',
})
export class ChatMenuComponent {
  chat = input.required<Chat>();
  /** Lo escucha la cabecera para enseñar el detalle de la conversación. */
  informacion = output<void>();
  /** Para el aviso discreto de «Nombre actualizado». */
  guardado = output<void>();

  private readonly prefs = inject(PreferencesService);
  private readonly i18n = inject(I18nService);

  readonly abierto = signal(false);
  readonly editando = signal(false);
  readonly borrador = signal('');

  readonly tieneAlias = computed(() => !!this.prefs.alias(this.chat().id));

  alternar(): void {
    this.abierto.update((v) => !v);
    this.editando.set(false);
  }

  cerrar(): void {
    this.abierto.set(false);
    this.editando.set(false);
  }

  empezarAEditar(): void {
    // Se parte del nombre que se está viendo, no de una caja vacía: casi
    // siempre se quiere corregir algo, no escribir de cero.
    const actual = this.prefs.alias(this.chat().id);
    const visible = nombreVisible(this.chat(), actual, this.i18n.t());
    this.borrador.set(actual ?? (visible.provisional ? '' : visible.texto));
    this.editando.set(true);
  }

  guardar(): void {
    this.prefs.ponerAlias(this.chat().id, this.borrador());
    this.guardado.emit();
    this.cerrar();
  }

  quitarAlias(): void {
    // Vacío significa «vuelve al original». Es la misma intención dicha de
    // otra forma, así que no hace falta otra operación.
    this.prefs.ponerAlias(this.chat().id, '');
    this.guardado.emit();
    this.cerrar();
  }
}
