import { TestBed } from '@angular/core/testing';
import { Message } from '../../../core/models/api.models';
import {
  MessageListComponent,
  restoredScrollTop,
  shouldPinAfterMediaLoad,
} from './message-list.component';
describe('historical scroll', () => {
  it('preserves the visible anchor after prepend', () =>
    expect(restoredScrollTop(1800, 1000, 120)).toBe(920));
  it('does not jump to bottom after an image loads while reading old messages', () =>
    expect(shouldPinAfterMediaLoad(640)).toBe(false));
  it('keeps following media layout changes when already at the bottom', () =>
    expect(shouldPinAfterMediaLoad(40)).toBe(true));
});
describe('MessageListComponent behavior', () => {
  const messages: Message[] = [
    {
      id: '1',
      chatId: 'c',
      type: 'text',
      text: 'A',
      timestamp: '2026-08-10T10:00:00Z',
      fromMe: false,
    },
    {
      id: '2',
      chatId: 'c',
      type: 'text',
      text: 'B',
      timestamp: '2026-08-10T10:02:00Z',
      fromMe: false,
    },
  ];
  function setup(hasMore = false) {
    TestBed.configureTestingModule({ imports: [MessageListComponent] });
    const fixture = TestBed.createComponent(MessageListComponent);
    fixture.componentRef.setInput('messages', messages);
    fixture.componentRef.setInput('hasMore', hasMore);
    fixture.detectChanges();
    return fixture;
  }
  it('groups consecutive messages from the same side', () =>
    expect(setup().componentInstance.grouped(1)).toBe(true));
  it('emits at most one previous-page request per cooldown', () => {
    const fixture = setup(true);
    const scroller = (fixture.nativeElement as HTMLElement).querySelector(
      '.message-scroll',
    ) as HTMLElement;
    Object.defineProperties(scroller, {
      scrollTop: { value: 100, writable: true },
      scrollHeight: { value: 1000 },
      clientHeight: { value: 500 },
    });
    let calls = 0;
    fixture.componentInstance.loadOlder.subscribe(() => calls++);
    fixture.componentInstance.onScroll();
    fixture.componentInstance.onScroll();
    expect(calls).toBe(1);
  });
});
