import { avatarHue, initials, previewFor, safeHttpUrl } from './display';
describe('display helpers', () => {
  it('creates initials', () => expect(initials('VirtualTec Marco')).toBe('VM'));
  it('uses deterministic colors', () => expect(avatarHue('chat-1')).toBe(avatarHue('chat-1')));
  it('renders media preview', () => expect(previewFor('image')).toBe('📷 Foto'));
  it('labels unknown safely', () => expect(previewFor('unknown')).toBe('Mensaje no compatible'));
  it('rejects unsafe URLs', () => expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined());
});
