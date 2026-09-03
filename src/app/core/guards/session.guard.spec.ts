import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { SessionService } from '../services/session.service';
import { sessionGuard } from './session.guard';

describe('SessionGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;
  async function run(session: Partial<SessionService>) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SessionService, useValue: session }],
    });
    const result = TestBed.runInInjectionContext(() => sessionGuard(route, state));
    return firstValueFrom(result as Observable<boolean | object>);
  }
  it('allows read-only local mode', async () =>
    expect(
      await run({
        health: () => of({ status: 'ok', database: true, whatsappEnabled: false }),
      } as Partial<SessionService>),
    ).toBe(true));
  it('allows a connected session', async () =>
    expect(
      await run({
        health: () => of({ status: 'ok', database: true, whatsappEnabled: true }),
        getSession: () => of({ state: 'CONNECTED', connected: true }),
      } as Partial<SessionService>),
    ).toBe(true));
  it('redirects a disconnected session to pairing', async () => {
    const value = await run({
      health: () => of({ status: 'ok', database: true, whatsappEnabled: true }),
      getSession: () => of({ state: 'DISCONNECTED', connected: false }),
    } as Partial<SessionService>);
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(value as never)).toBe('/pairing');
  });
  it('redirects backend offline state with a marker', async () => {
    const value = await run({
      health: () => throwError(() => new Error('offline')),
    } as Partial<SessionService>);
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(value as never)).toBe('/pairing?offline=1');
  });
});
