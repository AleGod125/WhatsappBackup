import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ApiErrorBody, AppError } from '../models/api.models';

/** Consultas que YA saben tratar un 401: no deben provocar una redirección. */
const SIN_REDIRIGIR = ['/auth/me', '/auth/login', '/auth/register', '/onboarding/status'];

export const apiErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      const propia = SIN_REDIRIGIR.some((ruta) => request.url.includes(ruta));
      const codigo = (error.error as Partial<ApiErrorBody> | undefined)?.error?.code;

      // 401 y 403-de-Drive llevan a sitios DISTINTOS. Confundirlos deja al
      // usuario dando vueltas: el formulario de acceso no arregla que falte
      // Google Drive, y conectar Google no arregla no haber entrado.
      if (!propia && error.status === 401) {
        router.navigate(['/login']);
      } else if (!propia && error.status === 403 && codigo === 'DRIVE_NOT_AUTHORIZED') {
        router.navigate(['/connect-google']);
      }

      const body = error.error as Partial<ApiErrorBody> | undefined;
      const offline = error.status === 0;
      const friendly: AppError = {
        code: body?.error?.code ?? (offline ? 'BACKEND_OFFLINE' : 'REQUEST_FAILED'),
        message:
          body?.error?.message ??
          (offline
            ? 'No se pudo conectar con el servicio de WhatsApp Backup.'
            : 'No fue posible completar la solicitud.'),
        status: error.status,
        offline,
      };
      return throwError(() => friendly);
    }),
  );
};
