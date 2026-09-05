import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AppError } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { rutaPara } from '../../core/guards/onboarding.guard';

/** Longitud mínima. La misma que aplica el backend, que es quien manda. */
const MINIMO = 8;

@Component({
  selector: 'app-register-page',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-shell.scss',
  template: `
    <main class="auth-page">
      <div class="brand"><span class="brand-mark">W</span> WhatsApp Backup</div>

      <section class="card">
        <h1>Crear cuenta</h1>
        <p class="sub">Después conectarás tu Google Drive y tu WhatsApp.</p>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <form (ngSubmit)="crear()">
          <label>
            <span>Nombre</span>
            <input name="name" autocomplete="name" [(ngModel)]="name" [disabled]="busy()" />
          </label>
          <label>
            <span>Correo</span>
            <input
              name="email"
              type="email"
              autocomplete="email"
              required
              [(ngModel)]="email"
              [disabled]="busy()"
            />
          </label>
          <label>
            <span>Contraseña</span>
            <input
              name="password"
              type="password"
              autocomplete="new-password"
              required
              [(ngModel)]="password"
              [disabled]="busy()"
            />
            <small class="hint">
              Mínimo {{ minimo }} caracteres. Una frase larga protege más que
              símbolos raros.
            </small>
          </label>
          <label>
            <span>Repite la contraseña</span>
            <input
              name="confirm"
              type="password"
              autocomplete="new-password"
              required
              [(ngModel)]="confirm"
              [disabled]="busy()"
            />
          </label>
          <button type="submit" [disabled]="busy()">
            {{ busy() ? 'Creando…' : 'Crear cuenta' }}
          </button>
        </form>

        <p class="alt">¿Ya tienes cuenta? <a routerLink="/login">Iniciar sesión</a></p>
      </section>
    </main>
  `,
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly minimo = MINIMO;
  name = '';
  email = '';
  password = '';
  confirm = '';
  readonly busy = signal(false);
  readonly error = signal<string | undefined>(undefined);

  crear(): void {
    if (this.busy()) return;

    // Estas comprobaciones son comodidad: evitan una ida y vuelta. El backend
    // las repite TODAS, porque nada que venga del navegador es de fiar.
    if (this.password !== this.confirm) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    if (this.password.length < MINIMO) {
      this.error.set(`La contraseña necesita al menos ${MINIMO} caracteres.`);
      return;
    }

    this.busy.set(true);
    this.error.set(undefined);
    this.auth
      .register(this.email.trim(), this.password, this.name.trim() || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () =>
          this.auth
            .onboarding()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (estado) => this.router.navigateByUrl(rutaPara(estado.nextStep)),
              error: () => this.router.navigateByUrl('/connect-google'),
            }),
        error: (fallo: AppError) => {
          this.busy.set(false);
          this.error.set(fallo.message);
        },
      });
  }
}
