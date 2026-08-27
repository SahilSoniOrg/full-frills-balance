import { IconMap, isValidIconName } from '@/src/types/domainIcons';
import { ACCOUNT_ICON_PALETTE } from '@/src/constants/account-constants';

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

  it('keeps every account picker icon registered', () => {
    expect(ACCOUNT_ICON_PALETTE).toHaveLength(72);
    expect(ACCOUNT_ICON_PALETTE.every(isValidIconName)).toBe(true);
  });
});
