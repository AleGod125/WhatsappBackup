import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { SessionService } from '../services/session.service';

export const sessionGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  return session.health().pipe(
    switchMap((health) =>
      !health.whatsappEnabled && health.database
        ? of(true)
        : session
            .getSession()
            .pipe(
              map((state) =>
                state.connected || state.viewerAllowed ? true : router.createUrlTree(['/pairing']),
              ),
            ),
    ),
    catchError(() => of(router.createUrlTree(['/pairing'], { queryParams: { offline: '1' } }))),
  );
};
