import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { OnboardingStep } from '../models/api.models';
import { AuthService } from '../services/auth.service';

/**
 * Los guards preguntan al backend por dónde va el usuario.
 *
 * La regla vive en UN sitio —`/onboarding/status`— y aquí solo se obedece. Si
 * se duplicara la lógica en el enrutador, saltársela sería cuestión de
 * escribir otra URL en la barra de direcciones: el navegador no es un lugar
 * donde se puedan tomar decisiones de acceso.
 *
 * Estos guards mejoran la experiencia; la protección real la dan los 401/403
 * de la API. Que un guard falle no expone nada.
 */

const RUTA_DE_PASO: Record<OnboardingStep, string> = {
  login: '/login',
  connect_google: '/connect-google',
  pairing: '/pairing',
  dashboard: '/dashboard',
};

/** Deja pasar solo si el backend dice que este es el paso que toca. */
function guardDePaso(esperado: OnboardingStep): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    return auth.onboarding().pipe(
      map((estado): boolean | UrlTree => {
        if (estado.nextStep === esperado) return true;
        return router.createUrlTree([RUTA_DE_PASO[estado.nextStep]]);
      }),
      // Sin backend no se puede saber nada. Al login, que es el único destino
      // que siempre existe y desde el que se puede recuperar.
      catchError(() => of(router.createUrlTree(['/login'], { queryParams: { offline: '1' } }))),
    );
  };
}

export const dashboardGuard = guardDePaso('dashboard');
export const pairingGuard = guardDePaso('pairing');
export const connectGoogleGuard = guardDePaso('connect_google');

/**
 * Para el login y el registro: si YA está todo listo, no tiene sentido pedir
 * credenciales otra vez.
 */
export const invitadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.onboarding().pipe(
    map((estado): boolean | UrlTree =>
      estado.authenticated ? router.createUrlTree([RUTA_DE_PASO[estado.nextStep]]) : true,
    ),
    // Sin backend se deja ver el formulario: intentarlo y ver el error es
    // mejor que una pantalla en blanco.
    catchError(() => of(true)),
  );
};

/** A dónde mandar a alguien según el estado que acabamos de leer. */
export function rutaPara(paso: OnboardingStep): string {
  return RUTA_DE_PASO[paso];
}
