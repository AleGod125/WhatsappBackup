import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AppError } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { rutaPara } from '../../core/guards/onboarding.guard';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-shell.scss',
  template: `
    <main class="auth-page">
      <div class="brand"><span class="brand-mark">W</span> WhatsApp Backup</div>

      <section class="card">
        <h1>Inicia sesión</h1>
        <p class="sub">Tu copia local de WhatsApp, solo tuya.</p>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <form (ngSubmit)="entrar()">
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
              autocomplete="current-password"
              required
              [(ngModel)]="password"
              [disabled]="busy()"
            />
          </label>
          <button type="submit" [disabled]="busy() || !email || !password">
            {{ busy() ? 'Entrando…' : 'Iniciar sesión' }}
          </button>
        </form>

        <div class="sep">o</div>

        <button type="button" class="ghost" [disabled]="busy()" (click)="conGoogle()">
          Continuar con Google
        </button>

        <p class="alt">¿No tienes cuenta? <a routerLink="/register">Crear cuenta</a></p>
      </section>
    </main>
  `,
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  email = '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal<string | undefined>(undefined);

  entrar(): void {
    if (this.busy() || !this.email || !this.password) return;
    this.busy.set(true);
    this.error.set(undefined);

    this.auth
      .login(this.email.trim(), this.password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Adónde va después NO lo decide esta pantalla: se pregunta. Entrar
        // con contraseña autentica la aplicación, pero no conecta Drive.
        next: () => this.continuar(),
        error: (fallo: AppError) => {
          this.busy.set(false);
          this.error.set(fallo.message);
        },
      });
  }

  conGoogle(): void {
    // Pide identidad Y Drive en el mismo consentimiento: dos vueltas seguidas
    // a Google para lo mismo se leen como que algo ha fallado.
    this.auth.startGoogle();
  }

  private continuar(): void {
    this.auth
      .onboarding()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (estado) => this.router.navigateByUrl(rutaPara(estado.nextStep)),
        error: () => {
          this.busy.set(false);
          this.error.set('Sesión iniciada, pero no se pudo leer el estado.');
        },
      });
  }
}
