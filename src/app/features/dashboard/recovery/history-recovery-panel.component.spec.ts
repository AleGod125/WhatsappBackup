import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { RealtimeService } from '../../../core/events/realtime.service';
import { WebBootstrapService } from '../../../core/services/web-bootstrap.service';
import { HistoryRecoveryPanelComponent, recoveryLabel } from './history-recovery-panel.component';

describe('Web Bootstrap recovery labels', () => {
  it('keeps auxiliary pairing distinct', () =>
    expect(recoveryLabel('qr_required')).toBe('Vincula el recuperador auxiliar'));
  it('maps terminal states', () => {
    expect(recoveryLabel('completed')).toBe('Historial recuperado');
    expect(recoveryLabel('failed')).toBe('No se pudo recuperar el historial');
  });
  it('does not POST any recovery automatically on init', () => {
    const recoverChat = vi.fn();
    const recoverPending = vi.fn();
    TestBed.configureTestingModule({
      imports: [HistoryRecoveryPanelComponent],
      providers: [
        {
          provide: WebBootstrapService,
          useValue: { recoverChat, recoverPending, qrUrl: () => '/aux-qr' },
        },
        {
          provide: RealtimeService,
          useValue: { connect: vi.fn(), events$: new Subject() },
        },
      ],
    });
    const fixture = TestBed.createComponent(HistoryRecoveryPanelComponent);
    fixture.detectChanges();
    expect(recoverChat).not.toHaveBeenCalled();
    expect(recoverPending).not.toHaveBeenCalled();
  });
});
