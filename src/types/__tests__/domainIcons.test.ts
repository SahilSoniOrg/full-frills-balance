import { Icon, IconMap, isValidIconName, parseIconName } from '@/src/types/domainIcons';
import { ACCOUNT_ICON_PALETTE } from '@/src/constants/account-constants';

describe('domain icon definitions', () => {
  it('recognizes registered icon names', () => {
    expect(isValidIconName('wallet')).toBe(true);
    expect(isValidIconName('sliders')).toBe(true);
    expect(isValidIconName('terminal')).toBe(true);
  });

  it('rejects missing and unknown icon names', () => {
    expect(isValidIconName(undefined)).toBe(false);
    expect(isValidIconName(null)).toBe(false);
    expect(isValidIconName('not-an-icon')).toBe(false);
    expect(isValidIconName('toString')).toBe(false);
    expect(isValidIconName('constructor')).toBe(false);
    expect(isValidIconName('__proto__')).toBe(false);
  });

  it('exposes PascalCase catalog members', () => {
    expect(Object.entries(Icon)).toEqual(
      Object.keys(IconMap).map(key => [`${key.slice(0, 1).toUpperCase()}${key.slice(1)}`, key]),
    );
  });

  it('parses untrusted names onto the catalog', () => {
    expect(parseIconName('wallet', Icon.Briefcase)).toBe(Icon.Wallet);
    expect(parseIconName('not-an-icon', Icon.Briefcase)).toBe(Icon.Briefcase);
    expect(parseIconName(undefined, Icon.Wallet)).toBe(Icon.Wallet);
    expect(parseIconName(null, Icon.Tag)).toBe(Icon.Tag);
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
