import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, of } from 'rxjs';
import { AuthService } from './auth.service';
import { RealtimeService } from '../events/realtime.service';
import { HistoryProgressService } from '../../features/dashboard/conversation/history-progress';

/**
 * Salir de la cuenta. UN solo camino, para los dos botones que lo ofrecen.
 *
 * POR QUE UN SERVICIO Y NO UN METODO EN CADA SITIO
 * ------------------------------------------------
 * Hay dos puertas —el menú de los tres puntos y la pantalla de opciones— y
 * cerrar sesión no es «llamar al endpoint»: es cortar el canal en vivo, vaciar
 * lo que quedó en memoria y navegar, **en ese orden**. Duplicarlo en dos
 * componentes garantiza que uno de los dos se quede a medias, y el que se
 * quede a medias es el que filtra datos.
 *
 * EL ORDEN IMPORTA
 * ----------------
 * Primero se corta el `EventSource`. Al revés, el canal sigue reconectando
 * contra una sesión que ya no existe y llena la consola de 401 — y, peor,
 * puede entregar un evento de la cuenta anterior a la pantalla de login.
 *
 * LO QUE SE LIMPIA, Y POR QUE
 * ---------------------------
 * Los componentes mueren al navegar y se llevan su estado. Los servicios
 * `providedIn: 'root'` **no**: viven mientras viva la pestaña. El progreso de
 * historial guarda el id de la conversación abierta y cuántos mensajes se
 * recuperaron, así que sin vaciarlo el siguiente usuario que entrase en el
 * mismo navegador heredaría ese rastro.
 *
 * LO QUE ESTO NO HACE
 * -------------------
 * **No desvincula WhatsApp.** No borra el `device.json`, ni el Signal Store,
 * ni los mensajes, ni Google Drive. Cerrar sesión en un ordenador prestado no
 * puede costar volver a escanear un código QR: la próxima vez que ese usuario
 * entre, si su vinculación sigue siendo válida, va directo al panel.
 */
@Injectable({ providedIn: 'root' })
export class SessionExitService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly realtime = inject(RealtimeService, { optional: true });
  private readonly historial = inject(HistoryProgressService, { optional: true });

  /**
   * Cierra la sesión y lleva al login.
   *
   * Si el backend no contesta se sale igual: dejar al usuario dentro de un
   * panel que ya no puede usar es peor que un logout que no se pudo registrar
   * en el servidor. La cookie de sesión, además, ya no sirve de nada en
   * cuanto el backend la invalida por su cuenta.
   */
  salir(): Observable<unknown> {
    // Se corta y se vacía UNA vez, antes de pedir nada. Con el `EventSource`
    // ya cerrado no puede entrar ningún evento tardío, así que repetir la
    // limpieza al terminar no aportaría nada.
    this.cortarYLimpiar();
    return this.auth.logout().pipe(
      catchError(() => of(null)),
      finalize(() => void this.router.navigateByUrl('/login')),
    );
  }

  /** Corta el canal en vivo y vacía lo que sobrevive a la navegación. */
  private cortarYLimpiar(): void {
    try {
      this.realtime?.disconnect?.();
    } catch {
      // Cortar el canal no puede impedir salir.
    }
    try {
      this.historial?.limpiar?.();
    } catch {
      // Ni vaciar el progreso.
    }
  }
}
