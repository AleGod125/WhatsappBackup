import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { rutaPara } from '../../core/guards/onboarding.guard';

/**
 * Aterrizaje del OAuth. Pantalla de paso: no decide nada.
 *
 * En la URL solo viene un código de resultado; ningún token cruza el
 * navegador. Se pregunta al backend por el estado —que es quien acaba de
 * cambiarlo— y se navega a donde diga.
 */
@Component({
  selector: 'app-google-callback-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-shell.scss',
  template: `
    <main class="auth-page">
      <div class="brand"><span class="brand-mark">W</span> WhatsApp Backup</div>
      <section class="card">
        <h1>{{ titulo() }}</h1>
        <p class="sub">{{ detalle() }}</p>
      </section>
    </main>
  `,
})
export class GoogleCallbackPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly titulo = signal('Conectando con Google…');
  readonly detalle = signal('Un momento, estamos comprobando el acceso.');

  constructor() {
    const estado = new URLSearchParams(window.location.search).get('status') ?? '';

    if (estado && estado !== 'connected') {
      // No se resuelve aquí: la pantalla que sabe explicarlo y ofrecer el
      // botón es la de conectar Google.
      this.router.navigate(['/connect-google'], { queryParams: { reason: estado } });
      return;
    }

    this.auth
      .onboarding()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (valor) => this.router.navigateByUrl(rutaPara(valor.nextStep)),
        error: () => {
          this.titulo.set('No se pudo comprobar el estado');
          this.detalle.set('Vuelve a intentarlo desde la pantalla de acceso.');
          this.router.navigateByUrl('/login');
        },
      });
  }
}
