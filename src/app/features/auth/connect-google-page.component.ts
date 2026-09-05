import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/**
 * Paso obligatorio entre entrar y ver el panel.
 *
 * El almacenamiento de la copia es el Drive del usuario, así que sin esa
 * autorización el producto no tiene dónde guardar nada. Se explica en vez de
 * limitarse a bloquear: un muro sin motivo se lee como un fallo.
 */
@Component({
  selector: 'app-connect-google-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-shell.scss',
  template: `
    <main class="auth-page">
      <div class="brand"><span class="brand-mark">W</span> WhatsApp Backup</div>

      <section class="card">
        <h1>Conecta Google Drive</h1>
        <p class="sub">
          Tu copia de WhatsApp utilizará tu Google Drive como almacenamiento.
        </p>

        @if (aviso()) {
          <p class="error" role="alert">{{ aviso() }}</p>
        }

        <button type="button" (click)="conectar()">Conectar Google Drive</button>

        <p class="note">
          Solo pedimos permiso sobre <strong>los archivos que cree esta
          aplicación</strong>, no sobre el resto de tu Drive. Puedes revocarlo
          cuando quieras desde tu cuenta de Google.
        </p>

        <p class="alt"><a (click)="salir()">Cerrar sesión</a></p>
      </section>
    </main>
  `,
})
export class ConnectGooglePageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly aviso = signal<string | undefined>(undefined);

  constructor() {
    // Si viene rebotado del callback, se dice qué pasó. Sin esto volvería a
    // esta pantalla sin ninguna explicación y probaría lo mismo otra vez.
    const motivo = new URLSearchParams(window.location.search).get('reason');
    if (motivo) this.aviso.set(MOTIVOS[motivo] ?? MOTIVOS['default']);
  }

  conectar(): void {
    this.auth.startGoogle();
  }

  salir(): void {
    this.auth
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.router.navigateByUrl('/login') });
  }
}

export const MOTIVOS: Record<string, string> = {
  drive_denied:
    'Diste acceso a tu identidad pero no a Google Drive. Vuelve a conectar y acepta el permiso de Drive.',
  cancelled: 'Cancelaste la conexión con Google.',
  exchange_failed: 'Google no confirmó la conexión. Inténtalo de nuevo.',
  invalid_state: 'La respuesta de Google no correspondía a esta sesión. Inténtalo de nuevo.',
  google_already_linked: 'Esa cuenta de Google ya pertenece a otro usuario.',
  email_not_verified:
    'Google no confirma que ese correo sea tuyo. Inicia sesión con tu contraseña y conecta Google desde ahí.',
  unavailable: 'El servicio no está disponible ahora mismo.',
  default: 'No se pudo completar la conexión con Google.',
};
