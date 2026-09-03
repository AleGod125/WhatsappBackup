import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ApiErrorBody, AppError } from '../models/api.models';

export const apiErrorInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: HttpErrorResponse) => {
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
