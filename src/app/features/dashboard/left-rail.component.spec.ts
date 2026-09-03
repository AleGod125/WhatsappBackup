import { TestBed } from '@angular/core/testing';
import { LeftRailComponent } from './left-rail.component';

describe('LeftRailComponent', () => {
  it('emits one sync request when enabled', () => {
    const fixture = TestBed.createComponent(LeftRailComponent);
    let requests = 0;
    fixture.componentInstance.syncRequested.subscribe(() => requests++);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.sync-button').click();
    expect(requests).toBe(1);
  });

  it('disables and rotates while synchronization is running', () => {
    const fixture = TestBed.createComponent(LeftRailComponent);
    fixture.componentRef.setInput('syncRunning', true);
    fixture.componentRef.setInput('syncDisabled', true);
    fixture.componentRef.setInput('syncTooltip', 'Sincronizando...');
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.sync-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.classList.contains('running')).toBe(true);
    expect(button.title).toBe('Sincronizando...');
  });
});
