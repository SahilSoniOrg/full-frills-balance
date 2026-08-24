import { IconMap, isValidIconName } from '@/src/types/domainIcons';

describe('domain icon definitions', () => {
  it('recognizes registered icon names', () => {
    expect(isValidIconName('wallet')).toBe(true);
    expect(isValidIconName('terminal')).toBe(true);
  });

  it('rejects missing and unknown icon names', () => {
    expect(isValidIconName(undefined)).toBe(false);
    expect(isValidIconName('not-an-icon')).toBe(false);
  });

  it('keeps every registered icon mapped to a renderer', () => {
    expect(Object.keys(IconMap)).toContain('wallet');
    expect(Object.values(IconMap).every(Boolean)).toBe(true);
  });
});
